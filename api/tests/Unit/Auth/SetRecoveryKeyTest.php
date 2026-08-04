<?php

declare(strict_types=1);

use App\Application\Auth\SetRecoveryKey;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\Vault;
use Illuminate\Support\Facades\Event;
use RuntimeException;

/*
 * El servicio que escribe el material de recuperación. Ver ADR-010.
 *
 * Lo que se prueba aquí no es que escriba —eso ya lo cubre el test de la API— sino
 * que NO pueda escribir a medias.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create();
    $this->vault = $this->user->personalVault;
});

/**
 * Un envoltorio de recuperación de prueba, indexado por vault.
 *
 * @return array<string, WrappedVaultKey>
 */
function recoveryWrapper(string $vaultId, string $ciphertext = 'envoltorio-de-recuperacion'): array
{
    return [$vaultId => new WrappedVaultKey($ciphertext, 'nonce-de-recuperacion')];
}

it('escribe el envoltorio y el hash', function (): void {
    app(SetRecoveryKey::class)->handle(
        userId: $this->user->id,
        recoveryAuthHash: 'hash-de-recuperacion',
        wrappedKeys: recoveryWrapper($this->vault->id),
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
    ]);

    expect(User::query()->findOrFail($this->user->id)->recovery_auth_hash)->not->toBeNull();
});

/*
 * ESTE ES EL TEST QUE IMPORTA DE ESTE FICHERO.
 *
 * Los dos estados a medias posibles son igual de malos y los dos son silenciosos.
 * Con envoltorios y sin hash, el usuario no puede ni autenticarse para recuperar.
 * Con hash y sin envoltorios, se autentica y después no abre nada. Ninguno de los
 * dos da la cara hasta el día en que hace falta recuperar, que es exactamente el
 * día en que ya no hay otra vía.
 *
 * Se comprueba rompiendo el código a propósito, que es la regla que dejó la
 * Iteración 3: se fuerza el fallo justo entre las dos escrituras y se comprueba que
 * la primera se ha revertido. Ver los envoltorios escritos y suponer que la
 * transacción funciona no demuestra nada.
 */
it('no deja el envoltorio escrito si falla la escritura del hash', function (): void {
    Event::listen('eloquent.saving: '.User::class, function (): void {
        throw new RuntimeException('fallo forzado entre las dos escrituras');
    });

    expect(fn () => app(SetRecoveryKey::class)->handle(
        userId: $this->user->id,
        recoveryAuthHash: 'hash-de-recuperacion',
        wrappedKeys: recoveryWrapper($this->vault->id),
    ))->toThrow(RuntimeException::class);

    // El envoltorio ya se había escrito cuando saltó el fallo. Si la transacción no
    // lo revirtiera, esta fila tendría una segunda llave que ninguna clave abre.
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => null,
        'recovery_wrapped_key_iv' => null,
    ]);

    expect(User::query()->findOrFail($this->user->id)->recovery_auth_hash)->toBeNull();
});

/*
 * Hoy todo usuario tiene exactamente una vault, así que es tentador escribir el
 * servicio para una sola fila. vault_members existe precisamente porque la clave
 * envuelta es por miembro y por vault, y una cuenta con dos vaults necesita las dos
 * envueltas con la misma clave de recuperación. Ver ADR-008 y ADR-010.
 */
it('escribe el envoltorio de todas las vaults del usuario', function (): void {
    $segunda = Vault::query()->create(['name' => 'Compartida']);
    $segunda->members()->attach($this->user->id, membership());

    app(SetRecoveryKey::class)->handle(
        userId: $this->user->id,
        recoveryAuthHash: 'hash-de-recuperacion',
        wrappedKeys: [
            ...recoveryWrapper($this->vault->id, 'envoltorio-personal'),
            ...recoveryWrapper($segunda->id, 'envoltorio-compartida'),
        ],
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'recovery_wrapped_key' => 'envoltorio-personal',
    ]);

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $segunda->id,
        'recovery_wrapped_key' => 'envoltorio-compartida',
    ]);
});

/*
 * Segunda barrera del double guard. El controlador ya comprueba la pertenencia
 * antes de llamar; esto comprueba que el servicio tampoco escribiría en una fila
 * ajena si alguien lo llamara directamente.
 */
it('no escribe en la fila de otro aunque le pasen su vault', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    app(SetRecoveryKey::class)->handle(
        userId: $this->user->id,
        recoveryAuthHash: 'hash-de-recuperacion',
        wrappedKeys: recoveryWrapper($other->personalVault->id, 'no-deberia-escribirse'),
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $other->personalVault->id,
        'user_id' => $other->id,
        'recovery_wrapped_key' => null,
    ]);
});
