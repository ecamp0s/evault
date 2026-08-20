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
 * The service that rotates the master password. See ADR-008.
 *
 * What is tested here is not that it writes — the API test already covers that — but
 * that it cannot write halfway and that it takes down the sessions it should.
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
 * THIS IS THE TEST THAT MATTERS IN THIS FILE.
 *
 * The two half-done states are beyond repair from the server, which holds none of the
 * keys. With the password changed and the old wrapper, the user gets in and opens
 * nothing: the vault stays shut with their data inside. With the new wrapper and the
 * old password, they do not even get in.
 *
 * It is checked by breaking the code on purpose, which is the rule Iteration 3 left
 * behind: the failure is forced between the two writes and the first is checked to have
 * been rolled back.
 */
it('does not leave the wrapper rewritten when the password change fails', function (): void {
    Event::listen('eloquent.saving: '.User::class, function (): void {
        throw new RuntimeException('fallo forzado entre las dos escrituras');
    });

    expect(fn () => app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($this->vault->id),
    ))->toThrow(RuntimeException::class);

    // Were the transaction not to roll it back, this row would hold a wrapper that only
    // a master key the user never got to set can open.
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'wrapped_key' => 'clave-envuelta-de-prueba',
    ]);

    expect(Hash::check('hash-actual', User::query()->findOrFail($this->user->id)->password))->toBeTrue();
});

/*
 * Half the reason this operation exists: whoever changes their password suspecting a
 * theft expects the other device to stop getting in. A live token never looks at the
 * password again, so if they are not revoked here, they are never revoked.
 */
it('revokes the user\'s other tokens', function (): void {
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
 * With no token to keep, they all fall. It is what the recovery of ADR-010 needs, where
 * the token that arrives is single-use and has to die here.
 */
it('revokes every token when it is not told which to keep', function (): void {
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
 * It touches nobody else's tokens. Mandatory under ADR-004, and here the cost would be
 * somebody else's session closed out of the blue.
 */
it('does not revoke another user\'s tokens', function (): void {
    $other = User::factory()->withPersonalVault()->create();
    $foreignToken = $other->createToken(AccessTokens::NAME);

    app(RotateMasterPassword::class)->handle(
        userId: $this->user->id,
        newAuthHash: 'hash-nuevo',
        wrappedKeys: rewrapped($this->vault->id),
    );

    $this->assertDatabaseHas('personal_access_tokens', ['id' => $foreignToken->accessToken->id]);
});

it('does not write into somebody else\'s row even when handed their vault', function (): void {
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
