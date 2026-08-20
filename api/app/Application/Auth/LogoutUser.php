<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Revoking a single token, the one used to make the request. The user's other tokens
 * stay alive: signing out on one device must not sign out the others.
 */
final readonly class LogoutUser
{
    public function handle(int $userId, int $tokenId): void
    {
        /*
         * The filter by owner is the second barrier of the double guard. The controller
         * only passes the token of the authenticated request, so today somebody else's
         * cannot arrive, but this way it could not be revoked either if somebody called
         * the service with another user's identifier.
         *
         * It is idempotent: if the token no longer exists nothing happens, and the
         * endpoint answers the same. Retrying a logout must never give an error.
         */
        PersonalAccessToken::query()
            ->whereKey($tokenId)
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', User::class)
            ->delete();
    }
}
