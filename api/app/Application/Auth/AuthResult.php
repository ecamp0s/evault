<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * What registration and login return: the user and the token in the clear.
 *
 * The plaintext token only exists at this moment. Sanctum stores its hash, so if it is
 * not handed over here there is no way to recover it afterwards.
 */
final readonly class AuthResult
{
    public function __construct(
        public User $user,
        public string $token,
    ) {}
}
