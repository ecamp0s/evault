<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

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
    /**
     * @param  int|null  $replaces  the id of the token this one takes the place of, sent by
     *                              the tab that is unlocking again after a reload (#725)
     */
    public function handle(User $user, ?SessionClient $client = null, ?int $replaces = null): string
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
        $expired = $user->tokens()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->pluck('id');

        /*
         * READ FIRST AND DELETE BY PRIMARY KEY, and only when there is something to
         * delete (#730). A DELETE with a range condition locks the gaps of the index it
         * walks even when it finds no row, and a sign-up always finds none: two sign-ups
         * at once locked the same gap and MySQL killed one of them with a deadlock on the
         * token insert that follows. A plain read takes no lock, and deleting by id only
         * locks the rows that exist.
         */
        if ($expired->isNotEmpty()) {
            PersonalAccessToken::query()->whereKey($expired->all())->delete();
        }

        /*
         * THE TOKEN THIS ONE REPLACES, if the client says there is one (#725).
         *
         * Reloading the web locks the vault (ADR-007) and unlocking signs in again, so every
         * reload used to leave the previous token alive for its twelve hours with nobody to
         * use it: the list of open sessions showed five «Navegador» that were one browser.
         * The tab now remembers the id of its token —not the token, which is the secret
         * ADR-007 forbids keeping— and hands it over here.
         *
         * ONLY THE ACCOUNT'S OWN. The caller has just proved the master password or the
         * passkey, so it may close its own sessions, and it can do that from the list
         * anyway. Another account's id, or one that does not exist, changes nothing and the
         * answer is the same, so this is no way to learn which ids exist. Read first and
         * deleted by primary key, for the reason above (#730).
         */
        if ($replaces !== null) {
            $previous = $user->tokens()->whereKey($replaces)->value('id');

            if ($previous !== null) {
                PersonalAccessToken::query()->whereKey($previous)->delete();
            }
        }

        return $user->createToken(
            SessionClient::tokenName($client),
            ['*'],
            now()->addHours(AccessTokens::SESSION_HOURS),
        )->plainTextToken;
    }
}
