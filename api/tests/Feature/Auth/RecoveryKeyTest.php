<?php

declare(strict_types=1);

use App\Models\User;

/*
 * Registrar y sustituir la clave de recuperación. Ver ADR-010.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);
    $this->vault = $this->user->personalVault;
});

/**
 * El cuerpo de un alta de clave de recuperación, con lo que se quiera cambiar.
 *
 * Lo que va en los envoltorios no son claves de verdad, igual que en el resto de
 * tests del proyecto: el servidor no puede distinguirlas de un literal cualquiera,
 * y esa incapacidad es lo que ADR-010 garantiza.
 *
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function recoveryKeyData(string $vaultId, array $extra = []): array
{
    return array_merge([
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [[
            'vault_id' => $vaultId,
            'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
            'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
        ]],
    ], $extra);
}

it('exige autenticación', function (): void {
    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id))
        ->assertUnauthorized();
});

it('registra la clave de recuperación', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id))
        ->assertNoContent();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
        'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
    ]);
});

/*
 * El hash de recuperación se almacena hasheado, igual que password. Un servidor que
 * guardara el valor recibido tendría en la base de datos algo con lo que autenticarse
 * como el usuario. Ver ADR-010.
 */
it('nunca guarda el hash de recuperación tal y como llega', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id));

    $stored = User::query()->findOrFail($this->user->id)->recovery_auth_hash;

    expect($stored)->not->toBeNull()
        ->and($stored)->not->toBe('hash-de-recuperacion')
        ->and(Hash::check('hash-de-recuperacion', (string) $stored))->toBeTrue();
});

it('sustituye la clave anterior al regenerarla', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id));

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id, [
        'recovery_auth_hash' => 'hash-nuevo',
        'wrapped_keys' => [[
            'vault_id' => $this->vault->id,
            'recovery_wrapped_key' => 'envoltorio-nuevo',
            'recovery_wrapped_key_iv' => 'nonce-nuevo',
        ]],
    ]))->assertNoContent();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => 'envoltorio-nuevo',
    ]);

    // La anterior deja de servir en el momento de la sustitución.
    $stored = (string) User::query()->findOrFail($this->user->id)->recovery_auth_hash;

    expect(Hash::check('hash-de-recuperacion', $stored))->toBeFalse()
        ->and(Hash::check('hash-nuevo', $stored))->toBeTrue();
});

it('exige los tres campos de cada envoltorio', function (array $sin): void {
    actAsSession($this->user);

    $entry = [
        'vault_id' => $this->vault->id,
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
        'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
    ];

    unset($entry[$sin[0]]);

    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [$entry],
    ])->assertUnprocessable();
})->with([
    [['vault_id']],
    [['recovery_wrapped_key']],
    [['recovery_wrapped_key_iv']],
]);

it('exige el hash de recuperación', function (): void {
    actAsSession($this->user);

    $data = recoveryKeyData($this->vault->id);
    unset($data['recovery_auth_hash']);

    $this->postJson('/api/auth/recovery-key', $data)->assertUnprocessable();
});

/*
 * Aislamiento cross-tenant, obligatorio por ADR-004.
 *
 * Escribir en la fila de otro sería lo más grave que puede pasar aquí: dejaría al
 * atacante con una segunda llave sobre una vault ajena, y al dueño sin enterarse.
 */
it('no deja registrar una clave sobre el vault de otro', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($other->personalVault->id))
        ->assertNotFound();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $other->personalVault->id,
        'user_id' => $other->id,
        'recovery_wrapped_key' => null,
    ]);
});

/*
 * Y responde igual ante un vault que no existe, para no confirmar cuáles sí.
 */
it('responde igual ante un vault ajeno que ante uno inexistente', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $foreign = $this->postJson(
        '/api/auth/recovery-key',
        recoveryKeyData($other->personalVault->id)
    );

    $missing = $this->postJson(
        '/api/auth/recovery-key',
        recoveryKeyData('01952f3e-0000-7000-8000-000000000000')
    );

    expect($foreign->status())->toBe($missing->status())
        ->and($foreign->json('message'))->toBe($missing->json('message'));
});

/*
 * El hash de recuperación no puede aparecer en ninguna respuesta, igual que
 * password. Está en el atributo Hidden del modelo, y este test falla si alguien lo
 * quita de ahí.
 */
it('no expone el hash de recuperación en el contrato de /api/auth/me', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id));

    $this->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonMissingPath('data.user.recovery_auth_hash')
        ->assertJsonPath('data.user', fn (array $user): bool => ! array_key_exists('recovery_auth_hash', $user));
});
