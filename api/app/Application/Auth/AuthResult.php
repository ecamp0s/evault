<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * Lo que devuelven registro y login: el usuario y el token en claro.
 *
 * El token en claro solo existe en este momento. Sanctum guarda su hash, así que
 * si no se entrega aquí no hay forma de recuperarlo después.
 */
final readonly class AuthResult
{
    public function __construct(
        public User $user,
        public string $token,
    ) {}
}
