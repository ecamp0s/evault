<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

/*
 * Cambio de contraseña maestra. Ver ADR-008.
 *
 * Lo que hace barata esta operación es que la clave de vault no cambia: se reenvuelve
 * con la clave maestra nueva y los items no se tocan. Aquí se comprueba que el
 * servidor escribe eso entero o no escribe nada.
 */

beforeEach(function (): void {
    Cache::flush();

    $this->user = User::factory()->withPersonalVault()->create([
        'email' => 'ada@evault.test',
        'password' => 'hash-actual',
    ]);
    $this->vault = $this->user->personalVault;
});

/**
 * El cuerpo de un cambio válido, con lo que se quiera cambiar encima.
 *
 * Lo que va en los envoltorios no son claves de verdad: el servidor no puede
 * distinguirlas de un literal cualquiera, y esa incapacidad es lo que garantiza
 * ADR-008.
 *
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function masterPasswordData(string $vaultId, array $extra = []): array
{
    return array_merge([
        'current_password' => 'hash-actual',
        'password' => 'hash-nuevo',
        'wrapped_keys' => [[
            'vault_id' => $vaultId,
            'wrapped_key' => 'envoltorio-nuevo',
            'wrapped_key_iv' => 'nonce-nuevo',
        ]],
    ], $extra);
}

it('exige autenticación', function (): void {
    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id))
        ->assertUnauthorized();
});

it('cambia el hash de autenticación y reenvuelve la clave', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id))
        ->assertNoContent();

    $stored = User::query()->findOrFail($this->user->id);

    expect(Hash::check('hash-nuevo', $stored->password))->toBeTrue()
        ->and(Hash::check('hash-actual', $stored->password))->toBeFalse();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'wrapped_key' => 'envoltorio-nuevo',
        'wrapped_key_iv' => 'nonce-nuevo',
    ]);
});

/*
 * Los items no se tocan, que es todo el sentido de ADR-008. Si esta operación
 * llegara a reescribirlos, cambiar la contraseña dejaría de ser barato y pasaría a
 * poder corromper la vault a medias.
 */
it('no toca ningún item', function (): void {
    $item = $this->vault->items()->create([
        'ciphertext' => 'contenido-cifrado',
        'iv' => 'nonce-del-item',
        'version' => 2,
    ]);

    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id));

    expect($item->fresh()->ciphertext)->toBe('contenido-cifrado')
        ->and($item->fresh()->iv)->toBe('nonce-del-item');
});

/*
 * No basta con tener sesión: hay que saber la contraseña que hay. Sin esto, un token
 * robado bastaría para dejar fuera al dueño de su propia vault.
 */
it('rechaza un hash de autenticación actual incorrecto', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
        'current_password' => 'no-es-el-suyo',
    ]))->assertUnauthorized();

    expect(Hash::check('hash-actual', User::query()->findOrFail($this->user->id)->password))->toBeTrue();
});

it('exige los tres campos de cada envoltorio', function (array $without): void {
    actAsSession($this->user);

    $entry = [
        'vault_id' => $this->vault->id,
        'wrapped_key' => 'envoltorio-nuevo',
        'wrapped_key_iv' => 'nonce-nuevo',
    ];

    unset($entry[$without[0]]);

    $this->putJson('/api/auth/master-password', [
        'current_password' => 'hash-actual',
        'password' => 'hash-nuevo',
        'wrapped_keys' => [$entry],
    ])->assertUnprocessable();
})->with([[['vault_id']], [['wrapped_key']], [['wrapped_key_iv']]]);

/*
 * Reenvolver unas vaults sí y otras no dejaría las que faltan cerradas con una clave
 * maestra que ya no existe, y eso no se descubre hasta que alguien intenta abrirlas.
 */
it('exige reenvolver todas las vaults del usuario', function (): void {
    $second = Vault::query()->create(['name' => 'Compartida']);
    $second->members()->attach($this->user->id, membership());

    actAsSession($this->user);

    // Solo manda la personal, faltando la segunda.
    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id))
        ->assertNotFound();

    expect(Hash::check('hash-actual', User::query()->findOrFail($this->user->id)->password))->toBeTrue();
});

it('reenvuelve todas las vaults cuando se mandan todas', function (): void {
    $second = Vault::query()->create(['name' => 'Compartida']);
    $second->members()->attach($this->user->id, membership());

    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
        'wrapped_keys' => [
            ['vault_id' => $this->vault->id, 'wrapped_key' => 'personal-nuevo', 'wrapped_key_iv' => 'nonce-1'],
            ['vault_id' => $second->id, 'wrapped_key' => 'compartida-nuevo', 'wrapped_key_iv' => 'nonce-2'],
        ],
    ]))->assertNoContent();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id, 'wrapped_key' => 'personal-nuevo',
    ]);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $second->id, 'wrapped_key' => 'compartida-nuevo',
    ]);
});

/*
 * Aislamiento cross-tenant, obligatorio por ADR-004.
 */
it('no deja reenvolver la clave de otro', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($other->personalVault->id))
        ->assertNotFound();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $other->personalVault->id,
        'user_id' => $other->id,
        'wrapped_key' => 'clave-envuelta-de-prueba',
    ]);
});

it('limita los intentos y responde 429', function (): void {
    actAsSession($this->user);

    $limit = (int) config('throttling.master_password.attempts');

    for ($i = 0; $i < $limit; $i++) {
        $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
            'current_password' => 'no-es-el-suyo',
        ]))->assertUnauthorized();
    }

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
        'current_password' => 'no-es-el-suyo',
    ]))->assertStatus(429)->assertHeader('Retry-After');
});
