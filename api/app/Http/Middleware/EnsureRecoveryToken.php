<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Application\Auth\AccessTokens;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets through ONLY the recovery's single-use token. See ADR-010.
 *
 * It exists because Sanctum's `ability` middleware is no use for this, and the reason
 * is counter-intuitive: an ordinary session token is issued with the `*` ability, and
 * `*` satisfies ANY ability check. That is, `ability:recovery:complete` lets through
 * both the recovery token and every other one.
 *
 * With that, any session token could have set a new master password WITHOUT KNOWING
 * THE CURRENT ONE, skipping the verification /master-password performs. A stolen token
 * would have been enough to evict the owner from their own vault, which is precisely
 * what that endpoint takes the trouble to prevent. The test checking that an ordinary
 * session does not get in here caught it.
 *
 * That is why the exact list of abilities is compared instead of asking whether it has
 * one: what is wanted is not «can it do this», but «it can do nothing else».
 */
final class EnsureRecoveryToken
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();

        if (! $token instanceof PersonalAccessToken
            || $token->abilities !== [AccessTokens::RECOVERY_ABILITY]) {
            abort(403, 'Este token no sirve para terminar una recuperación.');
        }

        return $next($request);
    }
}
