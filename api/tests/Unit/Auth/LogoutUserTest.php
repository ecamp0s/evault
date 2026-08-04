<?php

declare(strict_types=1);

use App\Application\Auth\LogoutUser;
use App\Models\User;

it('revoca el token indicado', function (): void {
    $user = User::factory()->create();
    $token = $user->createToken('api');

    (new LogoutUser)->handle($user->id, $token->accessToken->id);

    $this->assertDatabaseCount('personal_access_tokens', 0);
});

/*
 * El double guard del servicio: aunque le llegue el identificador de un token que
 * no pertenece al usuario indicado, no lo revoca.
 */
it('no revoca un token de otro usuario', function (): void {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $foreignToken = $other->createToken('api');

    (new LogoutUser)->handle($user->id, $foreignToken->accessToken->id);

    $this->assertDatabaseCount('personal_access_tokens', 1);
});

it('no falla cuando el token ya no existe', function (): void {
    $user = User::factory()->create();

    (new LogoutUser)->handle($user->id, 99999);

    $this->assertDatabaseCount('personal_access_tokens', 0);
});
