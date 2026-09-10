<?php

declare(strict_types=1);

use App\Application\Auth\ChangeEmail;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\Passkey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\DB;
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

/*
 * The passkeys, which since ADR-021 have to fall with the email. See issue #565.
 *
 * The reason is the same one that forces the recovery key to be remade — the email is
 * the salt of the HKDF their material comes out of — and the outcome is different for a
 * reason worth having in a test rather than only in a comment: a passkey cannot be
 * remade from the server, because its secret lives inside an authenticator.
 */
describe('the passkeys', function (): void {
    beforeEach(function (): void {
        $this->passkey = Passkey::factory()->create([
            'user_id' => $this->user->id,
            'vault_id' => $this->vault->id,
        ]);
    });

    it('are taken down, because the email is the salt they were derived from', function (): void {
        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
        );

        $this->assertDatabaseMissing('passkeys', ['id' => $this->passkey->id]);
    });

    /*
     * Leaving one behind would be the worst of the endings: a row that looks like a
     * working shortcut and opens nothing, on an account whose owner believes they can
     * still get in with their face.
     */
    it('none is left behind, whichever of them it was', function (): void {
        Passkey::factory()->count(3)->create([
            'user_id' => $this->user->id, 'vault_id' => $this->vault->id,
        ]);

        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
        );

        expect(DB::table('passkeys')->count())->toBe(0);
    });

    it('somebody elses passkeys are left alone', function (): void {
        $grace = User::factory()->withPersonalVault()->create(['email' => 'grace@evault.test']);
        $theirs = Passkey::factory()->create([
            'user_id' => $grace->id, 'vault_id' => $grace->personalVault->id,
        ]);

        app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
        );

        $this->assertDatabaseHas('passkeys', ['id' => $theirs->id]);
    });

    /*
     * INSIDE THE SAME TRANSACTION as everything else. A failure that left the passkeys
     * deleted and the email unchanged would take away the shortcut of somebody whose
     * address never changed — silently, and with nothing to point at.
     */
    it('come back when the change fails halfway', function (): void {
        /*
         * The failure is forced on saving the user, which happens AFTER the passkeys are
         * deleted. So by the time it throws, the deletion has already run — and the test
         * is that the transaction puts them back.
         *
         * Without the deletion inside the transaction the account would be left with its
         * old email and no passkeys, which takes the shortcut away from somebody whose
         * address never changed, silently and with nothing to point at.
         *
         * WHAT THIS TEST CANNOT TELL APART, said rather than papered over: moving the
         * deletion to AFTER the transaction passes too. With the failure thrown inside,
         * the deletion never runs either way, so the two are observationally the same
         * from here. The difference only shows if the deletion itself fails, and there is
         * no way to force that without breaking the table.
         *
         * So the property this pins is «a failure does not leave the passkeys deleted»,
         * which is the one that matters. Not every mutation that survives is a hole —
         * some are equivalent — and claiming otherwise would be inventing a test to make
         * a number look better.
         */
        Event::listen('eloquent.saving: '.User::class, function (): void {
            throw new RuntimeException('fallo forzado después de borrar los passkeys');
        });

        expect(fn () => app(ChangeEmail::class)->handle(
            userId: $this->user->id,
            newEmail: 'ada.lovelace@evault.test',
            newAuthHash: 'hash-nuevo',
            wrappedKeys: wrappedForEmailChange($this->vault->id),
        ))->toThrow(RuntimeException::class);

        $this->assertDatabaseHas('passkeys', ['id' => $this->passkey->id]);
    });
});
