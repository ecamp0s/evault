<?php

declare(strict_types=1);

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/*
 * Unlocking with a passkey, without the master password. See ADR-021 and issue #560.
 *
 * The third public door of the API, and everything that was applied to the login and to
 * the recovery applies here: one answer for every failure, the check made always, and a
 * limiter of its own.
 */

beforeEach(function (): void {
    RateLimiter::clear('auth.passkey|127.0.0.1|ada@evault.test');
});

/** An account with one passkey whose derived hash is known. */
function anAccountWithPasskey(string $authHash = 'el-hash-del-prf'): User
{
    $user = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);

    Passkey::factory()->create([
        'user_id' => $user->id,
        'vault_id' => $user->personalVault->id,
        'auth_hash' => $authHash,
        'wrapped_key' => 'la-clave-envuelta-con-el-passkey',
        'wrapped_key_iv' => 'el-nonce-del-passkey',
    ]);

    return $user;
}

it('hands over the wrapper and a session token', function (): void {
    $user = anAccountWithPasskey();

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])
        ->assertOk()
        ->assertJsonPath('data.vault_id', $user->personalVault->id)
        ->assertJsonPath('data.wrapped_key', 'la-clave-envuelta-con-el-passkey')
        ->assertJsonPath('data.wrapped_key_iv', 'el-nonce-del-passkey')
        ->assertJsonStructure(['data' => ['token', 'user']]);
});

/*
 * The token has to be indistinguishable from the login's, for the reason AccessTokens
 * gives: a name of its own would say «this session came from a passkey».
 */
it('issues a token that does not say how it was obtained', function (): void {
    $user = anAccountWithPasskey();

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])->assertOk();

    expect($user->tokens()->pluck('name')->all())->toBe(['api'])
        ->and($user->tokens()->first()?->abilities)->toBe(['*']);
});

it('opens the vault it is asked about, and the token works', function (): void {
    anAccountWithPasskey();

    $token = $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])->json('data.token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk();
});

/*
 * THE THREE FAILURES ANSWER THE SAME THING, and the responses are compared against EACH
 * OTHER instead of each on its own. Asserting 401 three times separately would pass even
 * if one of them started saying something the others did not.
 */
it('does not let anybody tell the three ways of failing apart', function (): void {
    anAccountWithPasskey();
    User::factory()->withPersonalVault()->create(['email' => 'grace@evault.test']);

    $unknownEmail = $this->postJson('/api/auth/passkey', [
        'email' => 'nadie@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ]);
    $noPasskey = $this->postJson('/api/auth/passkey', [
        'email' => 'grace@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ]);
    $wrongHash = $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'otro-hash-cualquiera',
    ]);

    expect($unknownEmail->status())->toBe($noPasskey->status())
        ->and($noPasskey->status())->toBe($wrongHash->status())
        ->and($unknownEmail->status())->toBe(401)
        ->and($unknownEmail->content())->toBe($noPasskey->content())
        ->and($noPasskey->content())->toBe($wrongHash->content());
});

it('does not issue a token when it fails', function (): void {
    $user = anAccountWithPasskey();

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'otro-hash-cualquiera',
    ])->assertUnauthorized();

    expect($user->tokens()->count())->toBe(0);
});

/*
 * The email is not validated for shape, for the same reason RecoverRequest does not
 * validate it: a 422 saying «that is not an email» and a 401 saying nothing are two
 * different answers, and the difference is measurable from outside.
 */
it('answers the same to something that is not even an email', function (): void {
    anAccountWithPasskey();

    $notAnEmail = $this->postJson('/api/auth/passkey', [
        'email' => 'esto-no-es-un-correo', 'auth_hash' => 'el-hash-del-prf',
    ]);
    $unknownEmail = $this->postJson('/api/auth/passkey', [
        'email' => 'nadie@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ]);

    expect($notAnEmail->status())->toBe($unknownEmail->status())
        ->and($notAnEmail->content())->toBe($unknownEmail->content());
});

it('normalises the email like the rest of the project', function (): void {
    anAccountWithPasskey();

    $this->postJson('/api/auth/passkey', [
        'email' => '  ADA@Evault.test ', 'auth_hash' => 'el-hash-del-prf',
    ])->assertOk();
});

/*
 * The only metadata an unlock writes. It exists so somebody can tell their passkeys
 * apart before revoking one, and there is nothing else about the operation the server
 * records.
 */
it('marks when the passkey was last used', function (): void {
    $user = anAccountWithPasskey();

    expect($user->passkeys()->first()?->last_used_at)->toBeNull();

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])->assertOk();

    expect($user->passkeys()->first()?->last_used_at)->not->toBeNull();
});

it('does not mark it when the unlock fails', function (): void {
    $user = anAccountWithPasskey();

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'otro-hash-cualquiera',
    ])->assertUnauthorized();

    expect($user->passkeys()->first()?->last_used_at)->toBeNull();
});

/*
 * Several passkeys on one account: the right one has to be found wherever it sits in
 * the list. It matters because the loop deliberately does not stop at the match — see
 * UnlockWithPasskey — so a bug there would show up as «the last one works and the
 * others do not».
 */
it('finds the right passkey whichever position it is in', function (): void {
    $user = anAccountWithPasskey('el-primero');

    Passkey::factory()->create([
        'user_id' => $user->id,
        'vault_id' => $user->personalVault->id,
        'auth_hash' => 'el-segundo',
        'wrapped_key' => 'el-envoltorio-del-segundo',
        'wrapped_key_iv' => 'el-nonce-del-segundo',
    ]);

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-primero',
    ])->assertOk()->assertJsonPath('data.wrapped_key', 'la-clave-envuelta-con-el-passkey');

    RateLimiter::clear('auth.passkey|127.0.0.1|ada@evault.test');

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-segundo',
    ])->assertOk()->assertJsonPath('data.wrapped_key', 'el-envoltorio-del-segundo');
});

it('stops after the attempts its limiter allows', function (): void {
    anAccountWithPasskey();

    for ($attempt = 0; $attempt < 5; $attempt++) {
        $this->postJson('/api/auth/passkey', [
            'email' => 'ada@evault.test', 'auth_hash' => 'otro-hash-cualquiera',
        ])->assertUnauthorized();
    }

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])->assertStatus(429);
});

/*
 * A revoked passkey stops opening the moment its row is gone. It is what makes
 * revoking worth anything, and it costs nothing to check because the vault key never
 * changed — which is precisely why it needed checking.
 */
it('a revoked passkey no longer opens anything', function (): void {
    $user = anAccountWithPasskey();

    $user->passkeys()->delete();

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])->assertUnauthorized();
});

it('never stores the hash it received', function (): void {
    $user = anAccountWithPasskey();

    $stored = $user->passkeys()->first()?->auth_hash;

    expect($stored)->not->toBe('el-hash-del-prf')
        ->and(Hash::check('el-hash-del-prf', (string) $stored))->toBeTrue();
});

/*
 * THE TWO TESTS THAT PROTECT THE TIMING, and they exist because mutation said nothing
 * would notice if they did not.
 *
 * Removing the check against the dummy hash, and putting a `break` in the loop, both
 * left every functional test green — of course they did: neither changes a single
 * response. What they change is HOW LONG the answer takes, and that is not something an
 * assertion on a status code can see.
 *
 * MEASURING TIME WOULD BE THE WRONG FIX. A test that compares durations is intermittent
 * on a loaded runner, and an intermittent check gets ignored wholesale — the lesson of
 * #62. What is deterministic is HOW MANY TIMES the hash is checked, which is what the
 * duration is made of, so that is what these pin.
 *
 * The same hole exists in LoginUser and in RecoverAccess, whose comments make the same
 * promise with nothing behind it. That is #587 and not this issue.
 */
it('checks a hash even when the address is not registered', function (): void {
    anAccountWithPasskey();

    Hash::shouldReceive('check')->once()->andReturn(false);

    $this->postJson('/api/auth/passkey', [
        'email' => 'nadie@evault.test', 'auth_hash' => 'el-hash-del-prf',
    ])->assertUnauthorized();
});

it('checks every passkey, without stopping at the one that matched', function (): void {
    $user = anAccountWithPasskey('el-primero');

    foreach (['el-segundo', 'el-tercero'] as $hash) {
        Passkey::factory()->create([
            'user_id' => $user->id,
            'vault_id' => $user->personalVault->id,
            'auth_hash' => $hash,
        ]);
    }

    /*
     * True on the first one and false afterwards. With a `break` this would be called
     * once; without it, three times — whichever one matched.
     */
    Hash::shouldReceive('check')->times(3)->andReturn(true, false, false);

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-primero',
    ])->assertOk();
});
