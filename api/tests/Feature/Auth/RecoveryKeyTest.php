<?php

declare(strict_types=1);

use App\Models\User;

/*
 * Registrar y sustituir la clave de recuperación. Ver ADR-010.
 */

beforeEach(function (): void {
    $this->user = User::factory()->conVaultPersonal()->create(['email' => 'ada@evault.test']);
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
function datosDeClaveDeRecuperacion(string $vaultId, array $extra = []): array
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
    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($this->vault->id))
        ->assertUnauthorized();
});

it('registra la clave de recuperación', function (): void {
    actuarComoSesion($this->user);

    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($this->vault->id))
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
    actuarComoSesion($this->user);

    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($this->vault->id));

    $almacenado = User::query()->findOrFail($this->user->id)->recovery_auth_hash;

    expect($almacenado)->not->toBeNull()
        ->and($almacenado)->not->toBe('hash-de-recuperacion')
        ->and(Hash::check('hash-de-recuperacion', (string) $almacenado))->toBeTrue();
});

it('sustituye la clave anterior al regenerarla', function (): void {
    actuarComoSesion($this->user);

    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($this->vault->id));

    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($this->vault->id, [
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
    $almacenado = (string) User::query()->findOrFail($this->user->id)->recovery_auth_hash;

    expect(Hash::check('hash-de-recuperacion', $almacenado))->toBeFalse()
        ->and(Hash::check('hash-nuevo', $almacenado))->toBeTrue();
});

it('exige los tres campos de cada envoltorio', function (array $sin): void {
    actuarComoSesion($this->user);

    $entrada = [
        'vault_id' => $this->vault->id,
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
        'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
    ];

    unset($entrada[$sin[0]]);

    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [$entrada],
    ])->assertUnprocessable();
})->with([
    [['vault_id']],
    [['recovery_wrapped_key']],
    [['recovery_wrapped_key_iv']],
]);

it('exige el hash de recuperación', function (): void {
    actuarComoSesion($this->user);

    $datos = datosDeClaveDeRecuperacion($this->vault->id);
    unset($datos['recovery_auth_hash']);

    $this->postJson('/api/auth/recovery-key', $datos)->assertUnprocessable();
});

/*
 * Aislamiento cross-tenant, obligatorio por ADR-004.
 *
 * Escribir en la fila de otro sería lo más grave que puede pasar aquí: dejaría al
 * atacante con una segunda llave sobre una vault ajena, y al dueño sin enterarse.
 */
it('no deja registrar una clave sobre el vault de otro', function (): void {
    $otra = User::factory()->conVaultPersonal()->create();

    actuarComoSesion($this->user);

    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($otra->personalVault->id))
        ->assertNotFound();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $otra->personalVault->id,
        'user_id' => $otra->id,
        'recovery_wrapped_key' => null,
    ]);
});

/*
 * Y responde igual ante un vault que no existe, para no confirmar cuáles sí.
 */
it('responde igual ante un vault ajeno que ante uno inexistente', function (): void {
    $otra = User::factory()->conVaultPersonal()->create();

    actuarComoSesion($this->user);

    $ajeno = $this->postJson(
        '/api/auth/recovery-key',
        datosDeClaveDeRecuperacion($otra->personalVault->id)
    );

    $inexistente = $this->postJson(
        '/api/auth/recovery-key',
        datosDeClaveDeRecuperacion('01952f3e-0000-7000-8000-000000000000')
    );

    expect($ajeno->status())->toBe($inexistente->status())
        ->and($ajeno->json('message'))->toBe($inexistente->json('message'));
});

/*
 * El hash de recuperación no puede aparecer en ninguna respuesta, igual que
 * password. Está en el atributo Hidden del modelo, y este test falla si alguien lo
 * quita de ahí.
 */
it('no expone el hash de recuperación en el contrato de /api/auth/me', function (): void {
    actuarComoSesion($this->user);

    $this->postJson('/api/auth/recovery-key', datosDeClaveDeRecuperacion($this->vault->id));

    $this->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonMissingPath('data.user.recovery_auth_hash')
        ->assertJsonPath('data.user', fn (array $user): bool => ! array_key_exists('recovery_auth_hash', $user));
});
