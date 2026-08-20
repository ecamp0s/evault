<?php

declare(strict_types=1);

use App\Application\Auth\SetRecoveryKey;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\Vault;
use Illuminate\Support\Facades\Event;
use RuntimeException;

/*
 * The service that writes the recovery material. See ADR-010.
 *
 * What is tested here is not that it writes — the API test already covers that — but
 * that it CANNOT write halfway.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create();
    $this->vault = $this->user->personalVault;
});

/**
 * A test recovery wrapper, keyed by vault.
 *
 * @return array<string, WrappedVaultKey>
 */
function recoveryWrapper(string $vaultId, string $ciphertext = 'envoltorio-de-recuperacion'): array
{
    return [$vaultId => new WrappedVaultKey($ciphertext, 'nonce-de-recuperacion')];
}

it('writes the wrapper and the hash', function (): void {
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
 * THIS IS THE TEST THAT MATTERS IN THIS FILE.
 *
 * The two possible half-done states are equally bad and both are silent. With wrappers
 * and no hash, the user cannot even authenticate to recover. With a hash and no
 * wrappers, they authenticate and then open nothing. Neither shows its face until the
 * day recovery is needed, which is exactly the day there is no other way left.
 *
 * It is checked by breaking the code on purpose, which is the rule Iteration 3 left
 * behind: the failure is forced right between the two writes and the first is checked
 * to have been rolled back. Seeing the wrappers written and assuming the transaction
 * works proves nothing.
 */
it('does not leave the wrapper written when writing the hash fails', function (): void {
    Event::listen('eloquent.saving: '.User::class, function (): void {
        throw new RuntimeException('fallo forzado entre las dos escrituras');
    });

    expect(fn () => app(SetRecoveryKey::class)->handle(
        userId: $this->user->id,
        recoveryAuthHash: 'hash-de-recuperacion',
        wrappedKeys: recoveryWrapper($this->vault->id),
    ))->toThrow(RuntimeException::class);

    // The wrapper had already been written when the failure fired. Were the transaction
    // not to roll it back, this row would hold a second key that no key opens.
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => null,
        'recovery_wrapped_key_iv' => null,
    ]);

    expect(User::query()->findOrFail($this->user->id)->recovery_auth_hash)->toBeNull();
});

/*
 * Today every user has exactly one vault, so it is tempting to write the service for a
 * single row. vault_members exists precisely because the wrapped key is per member and
 * per vault, and an account with two vaults needs both wrapped with the same recovery
 * key. See ADR-008 and ADR-010.
 */
it('writes the wrapper for every one of the user\'s vaults', function (): void {
    $second = Vault::query()->create(['name' => 'Compartida']);
    $second->members()->attach($this->user->id, membership());

    app(SetRecoveryKey::class)->handle(
        userId: $this->user->id,
        recoveryAuthHash: 'hash-de-recuperacion',
        wrappedKeys: [
            ...recoveryWrapper($this->vault->id, 'envoltorio-personal'),
            ...recoveryWrapper($second->id, 'envoltorio-compartida'),
        ],
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'recovery_wrapped_key' => 'envoltorio-personal',
    ]);

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $second->id,
        'recovery_wrapped_key' => 'envoltorio-compartida',
    ]);
});

/*
 * Second barrier of the double guard. The controller already checks membership before
 * calling; this checks that the service would not write into somebody else's row either
 * if it were called directly.
 */
it('does not write into somebody else\'s row even when handed their vault', function (): void {
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
