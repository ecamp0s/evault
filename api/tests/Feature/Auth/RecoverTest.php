<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

/*
 * Recovering access with the recovery key. See ADR-010.
 *
 * It is the second path into the vault, and until Iteration 4 there was only one.
 * Almost everything checked here is that this path does not leak more than the login
 * does, which is the part that can turn out expensive.
 */

beforeEach(function (): void {
    Cache::flush();

    $this->user = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);
    $this->vault = $this->user->personalVault;

    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [[
            'vault_id' => $this->vault->id,
            'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
            'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
        ]],
    ])->assertNoContent();

    // The rest of the tests call the public endpoint, with no session.
    forgetResolvedSession();
});

it('hands the wrapper to whoever holds the recovery key', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ])
        ->assertOk()
        ->assertJsonPath('data.wrapped_keys.0.vault_id', $this->vault->id)
        ->assertJsonPath('data.wrapped_keys.0.recovery_wrapped_key', 'envoltorio-de-recuperacion')
        ->assertJsonPath('data.wrapped_keys.0.recovery_wrapped_key_iv', 'nonce-de-recuperacion')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email'], 'wrapped_keys', 'token']]);
});

it('normalises the email the same way the login does', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => '  ADA@evault.test ',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ])->assertOk();
});

it('refuses a wrong recovery key with a 401', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'no-es-la-suya',
    ])->assertUnauthorized();
});

it('refuses an email that does not exist with a 401', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => 'nadie@evault.test',
        'recovery_auth_hash' => 'da-igual-cual',
    ])->assertUnauthorized();
});

/*
 * The three possible failures have to be indistinguishable from the outside, and there
 * is one more than in the login: here there is also the user who never registered a
 * recovery key. Telling that one apart would say who has a second key and who does
 * not, which is something the login does not leak and this endpoint is not going to
 * start leaking.
 */
it('reveals neither whether the email exists nor whether it has a recovery key', function (): void {
    $withoutKey = User::factory()->withPersonalVault()->create(['email' => 'sin-clave@evault.test']);

    $missing = $this->postJson('/api/auth/recover', [
        'email' => 'nadie@evault.test',
        'recovery_auth_hash' => 'da-igual-cual',
    ]);

    $wrongKey = $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'no-es-la-suya',
    ]);

    $notRegistered = $this->postJson('/api/auth/recover', [
        'email' => $withoutKey->email,
        'recovery_auth_hash' => 'da-igual-cual',
    ]);

    expect($wrongKey->status())->toBe($missing->status())
        ->and($notRegistered->status())->toBe($missing->status())
        ->and($wrongKey->json('message'))->toBe($missing->json('message'))
        ->and($notRegistered->json('message'))->toBe($missing->json('message'));
});

/*
 * THE PROTECTION AGAINST THE TIMING CHANNEL, which had a comment promising it since
 * Iteration 4 and nothing behind it. See issue #587.
 *
 * The test above compares the three responses and they are identical — that is the
 * leak through the CONTENT, and it was covered. What was not is the leak through the
 * TIME: leaving early when there is no user, or no recovery key, makes those answers
 * measurably faster than a wrong key on an account that has one. Taking the dummy hash
 * away changes no response at all, and left the whole suite green when it was measured.
 *
 * AND THIS ENDPOINT LEAKS MORE THAN THE LOGIN WOULD, which is why its own comment says
 * the reason weighs more here: the difference would say not only which addresses are
 * registered but which of them have a second key — something the login does not leak
 * and that is not worth starting to.
 *
 * Counting the hash checks and not the milliseconds, for the reason #62 teaches: a test
 * over durations is intermittent on a loaded runner, and an intermittent check gets
 * ignored wholesale.
 */
describe('it takes the same work to fail whatever the reason', function (): void {
    it('checks a hash when the email is not registered', function (): void {
        Hash::shouldReceive('check')->once()->andReturn(false);

        $this->postJson('/api/auth/recover', [
            'email' => 'nadie@evault.test',
            'recovery_auth_hash' => 'da-igual-cual',
        ])->assertUnauthorized();
    });

    /*
     * The one that is particular to this endpoint. An account with no recovery key has
     * nothing to compare against, so leaving early here is the tempting shortcut — and
     * it is the one that would say which accounts have a second key.
     */
    it('checks a hash when the account has no recovery key', function (): void {
        User::factory()->withPersonalVault()->create(['email' => 'sin-clave@evault.test']);

        Hash::shouldReceive('check')->once()->andReturn(false);

        $this->postJson('/api/auth/recover', [
            'email' => 'sin-clave@evault.test',
            'recovery_auth_hash' => 'da-igual-cual',
        ])->assertUnauthorized();
    });

    it('checks exactly one hash when the account does have one', function (): void {
        Hash::shouldReceive('check')->once()->andReturn(false);

        $this->postJson('/api/auth/recover', [
            'email' => 'ada@evault.test',
            'recovery_auth_hash' => 'no-es-la-suya',
        ])->assertUnauthorized();
    });
});

/*
 * Isolation: the response can only carry the wrappers of whoever proves the key.
 * Mandatory under ADR-004.
 */
it('never returns somebody else\'s recovery wrapper', function (): void {
    $other = User::factory()->withPersonalVault()->create(['email' => 'otra@evault.test']);

    actAsSession($other);
    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-otra',
        'wrapped_keys' => [[
            'vault_id' => $other->personalVault->id,
            'recovery_wrapped_key' => 'envoltorio-de-otra',
            'recovery_wrapped_key_iv' => 'nonce-de-otra',
        ]],
    ]);
    forgetResolvedSession();

    $response = $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ])->assertOk();

    expect($response->json('data.wrapped_keys'))->toHaveCount(1)
        ->and($response->json('data.wrapped_keys.0.vault_id'))->toBe($this->vault->id)
        ->and(json_encode($response->json()))->not->toContain('envoltorio-de-otra');
});

it('limits the attempts and answers 429', function (): void {
    $limit = (int) config('throttling.recovery.attempts');

    for ($i = 0; $i < $limit; $i++) {
        $this->postJson('/api/auth/recover', [
            'email' => 'ada@evault.test',
            'recovery_auth_hash' => 'no-es-la-suya',
        ])->assertUnauthorized();
    }

    $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'no-es-la-suya',
    ])->assertStatus(429)->assertHeader('Retry-After');
});

/*
 * The recovery limit is stricter than the login's, and not out of symmetry: the usage
 * profile is different. If somebody makes the two numbers equal by accident, this test
 * says so.
 */
it('limits recovery more tightly than the login', function (): void {
    expect((int) config('throttling.recovery.attempts'))
        ->toBeLessThan((int) config('throttling.login.attempts'));
});

/*
 * The token the recovery returns is the most delicate thing about this endpoint:
 * whoever receives it has proven they hold the recovery key, but does not yet know any
 * master password. If it opened the vault, the piece of paper would be worth the whole
 * account with no further steps. See ADR-010.
 */
describe('the recovery token', function (): void {
    beforeEach(function (): void {
        $this->token = $this->postJson('/api/auth/recover', [
            'email' => 'ada@evault.test',
            'recovery_auth_hash' => 'hash-de-recuperacion',
        ])->json('data.token');
    });

    it('is no use for listing the vaults', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson('/api/vaults')
            ->assertForbidden();
    });

    it('is no use for reading the vault\'s items', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson("/api/vaults/{$this->vault->id}/items")
            ->assertForbidden();
    });

    it('is no use for querying the session or closing it', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson('/api/auth/me')
            ->assertForbidden();

        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson('/api/auth/logout')
            ->assertForbidden();
    });

    it('is no use for replacing the recovery key', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson('/api/auth/recovery-key', [
                'recovery_auth_hash' => 'la-del-atacante',
                'wrapped_keys' => [[
                    'vault_id' => $this->vault->id,
                    'recovery_wrapped_key' => 'envoltorio-del-atacante',
                    'recovery_wrapped_key_iv' => 'nonce',
                ]],
            ])
            ->assertForbidden();
    });

    it('carries only the ability to finish the recovery', function (): void {
        $token = $this->user->tokens()->where('name', AccessTokens::RECOVERY_NAME)->firstOrFail();

        expect($token->abilities)->toBe([AccessTokens::RECOVERY_ABILITY]);
    });

    it('expires', function (): void {
        $token = $this->user->tokens()->where('name', AccessTokens::RECOVERY_NAME)->firstOrFail();

        expect($token->expires_at)->not->toBeNull()
            ->and($token->expires_at->isBefore(now()->addMinutes(AccessTokens::RECOVERY_MINUTES + 1)))->toBeTrue();
    });
});

/*
 * The final step: setting a new master password with the single-use token. See
 * ADR-010. It is what turns «I got in with the paper» into «I have my account back»,
 * and without it the recovery would leave the account hanging off that paper.
 */
describe('finishing the recovery', function (): void {
    beforeEach(function (): void {
        $this->recoveryToken = $this->postJson('/api/auth/recover', [
            'email' => 'ada@evault.test',
            'recovery_auth_hash' => 'hash-de-recuperacion',
        ])->json('data.token');

        $this->body = [
            'password' => 'hash-nuevo',
            'wrapped_keys' => [[
                'vault_id' => $this->vault->id,
                'wrapped_key' => 'reenvuelto-tras-recuperar',
                'wrapped_key_iv' => 'nonce-nuevo',
            ]],
        ];
    });

    it('sets the new password and re-wraps the key', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->recoveryToken}")
            ->postJson('/api/auth/recover/complete', $this->body)
            ->assertNoContent();

        $stored = User::query()->findOrFail($this->user->id);

        expect(Hash::check('hash-nuevo', $stored->password))->toBeTrue();

        $this->assertDatabaseHas('vault_members', [
            'vault_id' => $this->vault->id,
            'wrapped_key' => 'reenvuelto-tras-recuperar',
        ]);
    });

    /*
     * The token really is single-use: it dies in the same operation it completes. Were
     * it to survive, whoever had intercepted the response could set another password
     * afterwards.
     */
    it('leaves the recovery token useless', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->recoveryToken}")
            ->postJson('/api/auth/recover/complete', $this->body)
            ->assertNoContent();

        forgetResolvedSession();

        $this->withHeader('Authorization', "Bearer {$this->recoveryToken}")
            ->postJson('/api/auth/recover/complete', $this->body)
            ->assertUnauthorized();
    });

    it('demands authentication', function (): void {
        $this->postJson('/api/auth/recover/complete', $this->body)->assertUnauthorized();
    });

    /*
     * An ordinary session does not get in here. For changing the password while knowing
     * it there is /master-password, which does demand the current one; if this door
     * admitted any token, a stolen token would be enough to change it without knowing
     * it.
     */
    it('is not reached by an ordinary session token', function (): void {
        actAsSession($this->user);

        $this->postJson('/api/auth/recover/complete', $this->body)->assertForbidden();
    });

    it('does not allow re-wrapping somebody else\'s key', function (): void {
        $other = User::factory()->withPersonalVault()->create();

        $this->withHeader('Authorization', "Bearer {$this->recoveryToken}")
            ->postJson('/api/auth/recover/complete', [
                'password' => 'hash-nuevo',
                'wrapped_keys' => [[
                    'vault_id' => $other->personalVault->id,
                    'wrapped_key' => 'no-deberia',
                    'wrapped_key_iv' => 'nonce',
                ]],
            ])
            ->assertNotFound();
    });
});
