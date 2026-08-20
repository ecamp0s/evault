<?php

declare(strict_types=1);

use App\Models\User;

it('refuses a protected route with no token', function (): void {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

/*
 * A client that does not negotiate the content type has to receive the same 401 in
 * JSON, not a redirect to a non-existent 'login' route that would end in a 500.
 */
it('refuses with no token even when the client does not ask for JSON', function (): void {
    $this->get('/api/auth/me')
        ->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json');
});

it('accepts a protected route with a valid token', function (): void {
    $user = User::factory()->create();
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.email', $user->email);
});

it('refuses a token that does not exist', function (): void {
    $this->withHeader('Authorization', 'Bearer 1|noexiste')
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

/*
 * The reason config/sanctum.php leaves 'guard' as an empty list. With the ['web'] it
 * ships by default, this test would return 200 and the API would stop being stateless
 * without anybody noticing. See ADR-004.
 */
it('does not authenticate by session, only by token', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

it('issues the token into the personal_access_tokens table', function (): void {
    $user = User::factory()->create();
    $user->createToken('test');

    $this->assertDatabaseHas('personal_access_tokens', [
        'tokenable_id' => $user->id,
        'tokenable_type' => User::class,
        'name' => 'test',
    ]);
});
