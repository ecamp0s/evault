<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Closing one session of the account, which may be the one asking: then it is a logout.
 *
 * Unlike LogoutUser it is not silent about a token it cannot find, because here the
 * identifier comes from outside: a 404 is what tells the list that it is out of date,
 * and it is the same answer for somebody else's session and one that never existed.
 */
final readonly class RevokeSession
{
    /**
     * @throws SessionNotFound
     */
    public function handle(int $userId, int $tokenId): void
    {
        $deleted = PersonalAccessToken::query()
            ->whereKey($tokenId)
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', User::class)
            ->delete();

        if ($deleted === 0) {
            throw new SessionNotFound;
        }
    }
}
