<?php

declare(strict_types=1);

use App\Models\User;

beforeEach(function (): void {
    $this->user = User::factory()->create(['email' => 'ada@evault.test']);
    $this->token = $this->user->createToken('api')->plainTextToken;
});

it('returns the authenticated user', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.id', $this->user->id)
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'created_at']]]);
});

it('exposes no sensitive fields on the user', function (): void {
    $response = $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me');

    expect($response->json('data.user'))->not->toHaveKeys(['password', 'remember_token']);
});

/*
 * The other half of issue #149: that the expiry is not merely a column written. An
 * expired token has to be refused by the API, because that 401 is what makes the client
 * close the session — it does so in lib/session.ts's interceptor — and go back to
 * asking for the master password.
 *
 * It is checked with a token expired by hand and not by waiting twelve hours, of
 * course; what matters is that the refusal happens and not that the clock works.
 */
it('refuses an expired token', function (): void {
    $expired = $this->user->createToken('api', ['*'], now()->subMinute())->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$expired}")
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

it('accepts a token that has not expired yet', function (): void {
    $alive = $this->user->createToken('api', ['*'], now()->addMinute())->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$alive}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

it('refuses me with no token', function (): void {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

it('revokes the token on signing out', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    $this->assertDatabaseCount('personal_access_tokens', 0);

    forgetResolvedSession();

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

it('refuses signing out with no token', function (): void {
    $this->postJson('/api/auth/logout')->assertUnauthorized();
});

/*
 * Signing out on one device must not sign out the others, so only the token the
 * request was made with is revoked.
 */
it('does not revoke the user\'s other tokens', function (): void {
    $otherToken = $this->user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    $this->assertDatabaseCount('personal_access_tokens', 1);

    forgetResolvedSession();

    $this->withHeader('Authorization', "Bearer {$otherToken}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

/*
 * Isolation between users: one person's token cannot revoke another's or read their
 * data. Today the route does not admit passing somebody else's identifier, but the test
 * pins the guarantee in case tomorrow it did.
 */
it('does not let one user\'s token affect another', function (): void {
    $otherUser = User::factory()->create(['email' => 'otro@evault.test']);
    $foreignToken = $otherUser->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    forgetResolvedSession();

    $this->withHeader('Authorization', "Bearer {$foreignToken}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.email', 'otro@evault.test');
});

it('is idempotent when signing out twice', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    forgetResolvedSession();

    // The second attempt arrives with no valid token, so the right answer is 401 and
    // not a server error.
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertUnauthorized();
});

it('says whether there is a recovery key, without saying which', function (): void {
    /*
     * The email-change screen needs it: changing the email invalidates the recovery
     * key, so whoever has one must receive another in the same operation, and whoever
     * has none must not be saddled with an obligation. See ADR-014 §2.1.
     */
    $user = User::factory()->create(['recovery_auth_hash' => null]);
    actAsSession($user);

    $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.user.has_recovery_key', false);

    $user->forceFill(['recovery_auth_hash' => 'un-hash'])->save();
    forgetResolvedSession();
    actAsSession($user->refresh());

    $response = $this->getJson('/api/auth/me')->assertOk();

    expect($response->json('data.user.has_recovery_key'))->toBeTrue()
        // The hash does not come out of here, only the boolean.
        ->and($response->json('data.user'))->not->toHaveKey('recovery_auth_hash');
});
