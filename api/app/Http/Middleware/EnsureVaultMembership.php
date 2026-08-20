<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Application\Vaults\VaultMembership;
use App\Application\Vaults\VaultNotAccessible;
use App\Models\User;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * First barrier of the double guard: nobody enters a vault controller without
 * belonging to the route's vault.
 *
 * The second is in each application service, which checks it again. See ADR-004, which
 * demands both and not one.
 *
 * It goes here and not in the controller so that it does not depend on anybody
 * remembering to call it: any route added under this group is covered.
 */
final readonly class EnsureVaultMembership
{
    public function __construct(private VaultMembership $membership) {}

    /**
     * @param  Closure(Request): Response  $next
     *
     * @throws AuthenticationException
     * @throws VaultNotAccessible
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        $vaultId = $request->route('vault');

        /*
         * A parameter that is not a string cannot be a valid identifier, so it is
         * treated exactly like a vault that does not exist. The case is not told apart
         * because from the outside nothing must be told apart.
         */
        if (! is_string($vaultId)) {
            throw new VaultNotAccessible;
        }

        $this->membership->assert($user->id, $vaultId);

        return $next($request);
    }
}
