<?php

declare(strict_types=1);

use App\Application\Auth\ChangeEmail;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/*
 * The service that changes the email. See ADR-014.
 *
 * What is tested here is not that it writes — the API test covers that — but that it
 * cannot write halfway, that it takes down the sessions it should, and that it does
 * the right thing with the recovery key, which is the only part this path does not
 * share with the password rotation.
 *
 * The email is the salt of the derivation (ADR-008), so here there are FOUR writes and
 * not three, and the worst half-done state is the email changed with the old wrappers:
 * the user signs in, derives a different master key, and that key opens nothing.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create([
        'password' => 'hash-actual',
        'email' => 'ada@evault.test',
    ]);
    $this->vault = $this->user->personalVault;
});

/**
 * The name is long on purpose: PHP does not distinguish case in function names, so any
 * variant of `rewrapped` would collide with the one in the password rotation test,
 * which is global like this one.
 *
 * @return array<string, WrappedVaultKey>
 */
function wrappedForEmailChange(string $vaultId, string $ciphertext = 'envoltorio-nuevo'): array
{
    return [$vaultId => new WrappedVaultKey($ciphertext, 'nonce-nuevo')];
}

it('writes the email, the hash and the wrappers together', function (): void {
    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
    );

    $this->user->refresh();
    $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

    expect($this->user->email)->toBe('ada.lovelace@evault.test')
        ->and($member->wrapped_key)->toBe('envoltorio-nuevo');
});

/*
 * The test that gives the transaction its value: a failure is forced between the write
 * of the wrappers and that of the user, and the first is checked to have been rolled
 * back.
 */
it('does not leave the wrappers rewritten when the email change fails', function (): void {
    Event::listen('eloquent.saving: '.User::class, function (): void {
        throw new RuntimeException('fallo forzado entre las dos escrituras');
    });

    expect(fn () => app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
    ))->toThrow(RuntimeException::class);

    $this->user->refresh();
    $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

    expect($this->user->email)->toBe('ada@evault.test')
        ->and($member->wrapped_key)->not->toBe('envoltorio-nuevo');
});

it('does not write into somebody else\'s vault even when handed its identifier', function (): void {
    // Cross-tenant isolation, mandatory under ADR-004 in every critical service.
    $other = User::factory()->withPersonalVault()->create();
    $theirWrappedKey = VaultMember::query()->where('user_id', $other->id)->firstOrFail()->wrapped_key;

    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($other->personalVault->id, 'intruso'),
    );

    $member = VaultMember::query()->where('user_id', $other->id)->firstOrFail();

    expect($member->wrapped_key)->toBe($theirWrappedKey);
});

describe('the recovery key', function (): void {
    beforeEach(function (): void {
        $this->user->forceFill(['recovery_auth_hash' => 'hash-recuperacion-viejo'])->save();
        VaultMember::query()->where('user_id', $this->user->id)->update([
            'recovery_wrapped_key' => 'envoltorio-recuperacion-viejo',
            'recovery_wrapped_key_iv' => 'nonce-viejo',
        ]);
    });

    it('is remade when a new one arrives', function (): void {
        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
            recoveryAuthHash: 'hash-recuperacion-nuevo',
            recoveryWrappedKeys: [
                $this->vault->id => new WrappedVaultKey('envoltorio-recuperacion-nuevo', 'nonce-nuevo'),
            ],
        );

        $this->user->refresh();
        $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

        /*
         * With Hash::check and not by comparing strings: recovery_auth_hash carries the
         * 'hashed' cast, so the server NEVER stores the value it receives. Checking it
         * this way is also what pins that guarantee — if somebody removed the cast,
         * this test would go red — whereas a toBe() over the literal would go green
         * precisely when the hashing stopped being applied.
         */
        expect(Hash::check('hash-recuperacion-nuevo', $this->user->recovery_auth_hash))->toBeTrue()
            ->and($this->user->recovery_auth_hash)->not->toBe('hash-recuperacion-nuevo')
            ->and($member->recovery_wrapped_key)->toBe('envoltorio-recuperacion-nuevo');
    });

    /*
     * The least obvious decision of the service, and the one that avoids the worst
     * ending: a wrapper that can no longer be opened, stored as if it worked, and a
     * user convinced they have a safety net.
     *
     * The email is the salt of the HKDF the recovery keys come out of, so changing it
     * stops the old wrapper from opening. With no key you are in the earlier model,
     * which ADR-010 considers legitimate; with one that does not open, in neither.
     */
    it('is DELETED when no new one arrives, instead of staying unable to open', function (): void {
        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
        );

        $this->user->refresh();
        $member = VaultMember::query()->where('user_id', $this->user->id)->firstOrFail();

        expect($this->user->recovery_auth_hash)->toBeNull()
            ->and($member->recovery_wrapped_key)->toBeNull()
            ->and($member->recovery_wrapped_key_iv)->toBeNull();
    });
});

it('takes down the other tokens and keeps the request\'s own', function (): void {
    $survivor = $this->user->createToken('actual')->accessToken;
    $this->user->createToken('otro-dispositivo');

    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
        keepTokenId: $survivor->id,
    );

    expect($this->user->tokens()->pluck('id')->all())->toBe([$survivor->id]);
});

it('with no token to keep, they all fall', function (): void {
    $this->user->createToken('uno');
    $this->user->createToken('dos');

    app(ChangeEmail::class)->handle(
        userId: $this->user->id,
        newEmail: 'ada.lovelace@evault.test',
        newAuthHash: 'hash-nuevo',
        wrappedKeys: wrappedForEmailChange($this->vault->id),
    );

    expect($this->user->tokens()->count())->toBe(0);
});
