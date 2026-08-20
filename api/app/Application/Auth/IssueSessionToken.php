<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * Issues the session token, with its expiry, and takes the chance to sweep away the
 * ones from that same account that have already expired.
 *
 * It exists as a service and not as two repeated lines in the sign-up and the login
 * because both have to issue INDISTINGUISHABLE tokens: same name, same abilities and
 * same expiry. Were they to diverge, the token would reveal which way it was obtained.
 * Kept in one place, they cannot diverge by accident.
 */
final readonly class IssueSessionToken
{
    public function handle(User $user): string
    {
        /*
         * An opportunistic sweep of this account's expired tokens, taking advantage of
         * whoever authenticates having just proven they are its owner.
         *
         * It is what keeps the table from growing without a ceiling, which was half the
         * problem of issue #149: reloading the page locks the vault and unlocking does
         * a full login underneath, so every reload left a token nobody was going to use
         * again.
         *
         * It touches neither other accounts' tokens nor the ones still alive: signing
         * out on one device cannot sign out the others, which is the same thing
         * LogoutUser defends.
         *
         * For an instance with many accounts this is not enough — an account that never
         * signs in again keeps its expired ones — and that is where the
         * `sanctum:prune-expired` documented by the deployment guide comes in. But that
         * command needs a cron, and this needs nothing.
         */
        $user->tokens()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->delete();

        return $user->createToken(
            AccessTokens::NAME,
            ['*'],
            now()->addHours(AccessTokens::SESSION_HOURS),
        )->plainTextToken;
    }
}
