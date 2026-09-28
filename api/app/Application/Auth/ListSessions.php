<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * The sessions an account has open, most recently used first (ADR-018 §2.5, #711).
 *
 * What it says about each is what the table already had: when it started, when it was
 * last used, when it expires, which client it went to and which one is asking. Expired
 * tokens are left out because Sanctum no longer accepts them, so they are not open.
 *
 * A recovery under way is listed too, as 'recovery': somebody holding the recovery key
 * right now is exactly what the owner of the account would want to see here.
 *
 * The identifiers are the tokens' own, sequential integers. They say roughly how many
 * sessions the instance has issued, and it is accepted: every client already reads its
 * own in the «id|secret» shape of its token.
 */
final readonly class ListSessions
{
    /**
     * @return list<SessionSummary>
     */
    public function handle(int $userId, int $currentTokenId): array
    {
        $tokens = PersonalAccessToken::query()
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', User::class)
            ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderByRaw('last_used_at IS NULL')
            ->orderByDesc('last_used_at')
            ->orderByDesc('id')
            ->get();

        return array_values($tokens->map(fn (PersonalAccessToken $token): SessionSummary => new SessionSummary(
            id: $token->id,
            client: self::clientOf($token->name),
            createdAt: $token->created_at,
            lastUsedAt: $token->last_used_at,
            expiresAt: $token->expires_at,
            current: $token->id === $currentTokenId,
        ))->all());
    }

    private static function clientOf(string $name): ?string
    {
        if ($name === AccessTokens::RECOVERY_NAME) {
            return 'recovery';
        }

        return SessionClient::tryFrom($name)?->value;
    }
}
