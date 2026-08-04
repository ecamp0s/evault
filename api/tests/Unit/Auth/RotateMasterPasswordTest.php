<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Application\Auth\RotateMasterPassword;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/*
 * El servicio que rota la contraseña maestra. Ver ADR-008.
 *
 * Lo que se prueba aquí no es que escriba —eso ya lo cubre el test de la API— sino
 * que no pueda escribir a medias y que se lleve por delante las sesiones que debe.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create(['password' => 'hash-actual']);
    $this->vault = $this->user->personalVault;
});

/**
 * @return array<string, WrappedVaultKey>
 */
function rewrapped(string $vaultId, string $ciphertext = 'envoltorio-nuevo'): array
{
    return [$vaultId => new WrappedVaultKey($ciphertext, 'nonce-nuevo')];
}

/*
 * ESTE ES EL TEST QUE IMPORTA DE ESTE FICHERO.
 *
 * Los dos estados a medias son irreparables desde el servidor, que no tiene ninguna
 * de las claves. Con la contraseña cambiada y el envoltorio viejo, el usuario entra
 * y no abre nada: la vault queda cerrada con sus datos dentro. Con el envoltorio
 * nuevo y la contraseña vieja, ni siquiera entra.
 *
 * Se comprueba rompiendo el código a propósito, que es la regla que dejó la
 * Iteración 3: se fuerza el fallo entre las dos escrituras y se comprueba que la
 * primera se revirtió.
 */
it('no deja el envoltorio reescrito si falla el cambio de contraseña', function (): void {
    Event::listen('eloquent.saving: '.User::class, function (): void {
        throw new RuntimeException('fallo forzado entre las dos escrituras');
    });

    expect(fn () => app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($this->vault->id),
    ))->toThrow(RuntimeException::class);

    // Si la transacción no lo revirtiera, esta fila tendría un envoltorio que solo
    // abre una clave maestra que el usuario nunca llegó a fijar.
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'wrapped_key' => 'clave-envuelta-de-prueba',
    ]);

    expect(Hash::check('hash-actual', User::query()->findOrFail($this->user->id)->password))->toBeTrue();
});

/*
 * Media razón de ser de esta operación: quien cambia su contraseña sospechando un
 * robo espera que el otro dispositivo deje de entrar. Un token vivo no vuelve a
 * mirar la contraseña, así que si no se revocan aquí, no se revocan nunca.
 */
it('revoca los demás tokens del usuario', function (): void {
    $keep = $this->user->createToken(AccessTokens::NAME);
    $other = $this->user->createToken(AccessTokens::NAME);

    app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($this->vault->id),
        keepTokenId: $keep->accessToken->id,
    );

    $this->assertDatabaseHas('personal_access_tokens', ['id' => $keep->accessToken->id]);
    $this->assertDatabaseMissing('personal_access_tokens', ['id' => $other->accessToken->id]);
});

/*
 * Sin token que conservar caen todos. Es lo que necesita la recuperación de
 * ADR-010, donde el token que llega es de un solo uso y tiene que morir aquí.
 */
it('revoca todos los tokens cuando no se le dice cuál conservar', function (): void {
    $first = $this->user->createToken(AccessTokens::NAME);
    $second = $this->user->createToken(AccessTokens::NAME);

    app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($this->vault->id),
    );

    $this->assertDatabaseMissing('personal_access_tokens', ['id' => $first->accessToken->id]);
    $this->assertDatabaseMissing('personal_access_tokens', ['id' => $second->accessToken->id]);
});

/*
 * No toca los tokens de nadie más. Obligatorio por ADR-004, y aquí valdría una
 * sesión ajena cerrada de golpe.
 */
it('no revoca los tokens de otro usuario', function (): void {
    $other = User::factory()->withPersonalVault()->create();
    $foreignToken = $other->createToken(AccessTokens::NAME);

    app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($this->vault->id),
    );

    $this->assertDatabaseHas('personal_access_tokens', ['id' => $foreignToken->accessToken->id]);
});

it('no escribe en la fila de otro aunque le pasen su vault', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($other->personalVault->id, 'no-deberia-escribirse'),
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $other->personalVault->id,
        'user_id' => $other->id,
        'wrapped_key' => 'clave-envuelta-de-prueba',
    ]);
});
