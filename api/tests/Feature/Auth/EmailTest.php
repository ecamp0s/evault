<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Support\Facades\Hash;

/*
 * El endpoint de cambio de correo. Ver ADR-014.
 *
 * El correo no es un dato de perfil: por ADR-008 es el salt del que se derivan la
 * clave maestra y las claves de recuperación, así que esto no actualiza un campo.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create([
        'email' => 'ada@evault.test',
        'password' => 'hash-actual',
    ]);
    $this->vault = $this->user->personalVault;
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function changeEmailPayload(string $vaultId, array $overrides = []): array
{
    return array_merge([
        'email' => 'ada.lovelace@evault.test',
        'current_password' => 'hash-actual',
        'password' => 'hash-nuevo',
        'wrapped_keys' => [[
            'vault_id' => $vaultId,
            'wrapped_key' => 'envoltorio-nuevo',
            'wrapped_key_iv' => 'nonce-nuevo',
        ]],
    ], $overrides);
}

it('cambia el correo y deja entrar con el nuevo', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id))
        ->assertNoContent();

    $this->user->refresh();

    expect($this->user->email)->toBe('ada.lovelace@evault.test')
        ->and(Hash::check('hash-nuevo', $this->user->password))->toBeTrue();
});

it('normaliza el correo igual que el cliente', function (): void {
    /*
     * Es parte del contrato criptográfico y no una cortesía: el correo ES el salt, así
     * que si el servidor lo guardara sin normalizar, el cliente derivaría con la forma
     * canónica y las dos claves no coincidirían. El usuario escribiría su contraseña
     * buena y su vault no abriría, SIN ningún error que lo explicara.
     *
     * El equivalente en el cliente es normalizeEmail() de lib/vault/crypto.ts.
     */
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => '  ADA.Lovelace@EVault.test  ',
    ]))
        ->assertNoContent();

    expect($this->user->refresh()->email)->toBe('ada.lovelace@evault.test');
});

it('no cambia nada si la contraseña actual no es la correcta', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'current_password' => 'no-es-esta',
    ]))
        ->assertUnauthorized();

    expect($this->user->refresh()->email)->toBe('ada@evault.test');
});

/*
 * EL TEST QUE IMPORTA DE ESTE FICHERO, y por eso compara las dos respuestas en vez de
 * comprobar cada una por su lado: si un correo ya registrado respondiera distinto que
 * una contraseña incorrecta, cualquiera con una sesión podría averiguar qué cuentas
 * existen en la instancia probándolas de una en una.
 *
 * Es el mismo cuidado que ADR-008 tuvo al descartar el endpoint de prelogin y que #126
 * tuvo en el de recuperación.
 */
it('responde igual ante un correo ya registrado que ante una contraseña incorrecta', function (): void {
    User::factory()->create(['email' => 'ocupado@evault.test']);

    actAsSession($this->user);

    $takenResponse = $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => 'ocupado@evault.test',
    ]));

    $wrongPassword = $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'current_password' => 'no-es-esta',
    ]));

    expect($takenResponse->status())->toBe($wrongPassword->status())
        ->and($takenResponse->json())->toBe($wrongPassword->json());
});

it('deja cambiar al correo que ya se tiene, que no es un conflicto', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => 'ada@evault.test',
    ]))
        ->assertNoContent();
});

it('no toca los items, ni su updated_at', function (): void {
    /*
     * El dividendo de ADR-008: la clave de vault no cambia, solo se reenvuelve, así
     * que la operación cuesta lo mismo con tres entradas que con tres mil.
     */
    $item = VaultItem::factory()->for($this->vault)->create();
    $before = $item->updated_at;

    $this->travel(1)->minutes();

    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id))
        ->assertNoContent();

    expect($item->refresh()->updated_at->equalTo($before))->toBeTrue();
});

it('rechaza un vault que no es del usuario', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($other->personalVault->id))
        ->assertNotFound();

    expect($this->user->refresh()->email)->toBe('ada@evault.test');
});

it('exige reenvolver todas las vaults y no solo algunas', function (): void {
    // Dejarse una fuera la deja envuelta con una clave derivada de un correo que ya
    // no existe, y eso no se ve hasta que alguien intenta abrirla.
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'wrapped_keys' => [],
    ]))
        ->assertUnprocessable();
});

it('exige un correo con forma de correo', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => 'esto-no-es-un-correo',
    ]))
        ->assertUnprocessable();
});

it('no deja cambiar el correo sin sesión', function (): void {
    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id))
        ->assertUnauthorized();
});
