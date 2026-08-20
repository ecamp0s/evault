<?php

declare(strict_types=1);

use App\Application\Auth\LogoutUser;
use App\Models\User;

it('revokes the token it is given', function (): void {
    $user = User::factory()->create();
    $token = $user->createToken('api');

    (new LogoutUser)->handle($user->id, $token->accessToken->id);

    $this->assertDatabaseCount('personal_access_tokens', 0);
});

/*
 * The service's double guard: even when handed the identifier of a token that does not
 * belong to the given user, it does not revoke it.
 */
it('does not revoke another user\'s token', function (): void {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $foreignToken = $other->createToken('api');

    (new LogoutUser)->handle($user->id, $foreignToken->accessToken->id);

    $this->assertDatabaseCount('personal_access_tokens', 1);
});

it('does not fail when the token no longer exists', function (): void {
    $user = User::factory()->create();

    (new LogoutUser)->handle($user->id, 99999);

    $this->assertDatabaseCount('personal_access_tokens', 0);
});
