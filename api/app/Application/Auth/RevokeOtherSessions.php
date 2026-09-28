<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Closing every session of the account except the one asking, without rotating the
 * master password (ADR-018 §2.5).
 *
 * Until this, the only lever was PUT /auth/master-password, which revokes the tokens as
 * a side effect of re-wrapping the keys: «moving the whole world to close one door».
 *
 * What it does NOT touch, and the screen has to say: passkeys and the recovery key keep
 * opening the vault. Closing sessions ends who is inside, not who can come back in.
 */
final readonly class RevokeOtherSessions
{
    /** @return int how many sessions were closed */
    public function handle(int $userId, int $keepTokenId): int
    {
        $closed = PersonalAccessToken::query()
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', User::class)
            ->whereKeyNot($keepTokenId)
            ->delete();

        return is_int($closed) ? $closed : 0;
    }
}
