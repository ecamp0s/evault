<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\ListPasskeys;
use App\Application\Auth\PasskeyNotFound;
use App\Application\Auth\RegisterPasskey;
use App\Application\Auth\RevokePasskey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\PasskeyRequest;
use App\Http\Resources\PasskeyResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Managing the account's passkeys. See ADR-021.
 *
 * The three of them demand an ordinary session, and registering demands it twice over:
 * it takes the vault key in memory to wrap it, and only whoever has just unlocked has
 * that. A stolen token cannot add a passkey, because it cannot produce a wrapper that
 * opens anything.
 *
 * No logic here, as in the rest of the project's controllers.
 */
final class PasskeyController extends Controller
{
    /**
     * @return AnonymousResourceCollection<int, PasskeyResource>
     */
    public function index(Request $request, ListPasskeys $listPasskeys): AnonymousResourceCollection
    {
        return PasskeyResource::collection(
            $listPasskeys->handle($this->authenticatedUser($request)->id),
        );
    }

    public function store(PasskeyRequest $request, RegisterPasskey $registerPasskey): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        /*
         * First barrier of the double guard: the vault is checked to be theirs before
         * anything is written. The second lives in the service, which looks the vault up
         * through the user's own relation.
         *
         * 404 and not 403, as everywhere else: a 403 would confirm the identifier
         * exists.
         */
        if (! $user->vaults()->whereKey($request->string('vault_id')->toString())->exists()) {
            throw new PasskeyNotFound;
        }

        $passkey = $registerPasskey->handle(
            userId: $user->id,
            vaultId: $request->string('vault_id')->toString(),
            credentialId: $request->string('credential_id')->toString(),
            label: $request->string('label')->toString(),
            rpId: $request->string('rp_id')->toString(),
            authHash: $request->string('auth_hash')->toString(),
            wrappedKey: $request->string('wrapped_key')->toString(),
            wrappedKeyIv: $request->string('wrapped_key_iv')->toString(),
        );

        return PasskeyResource::make($passkey)->response()->setStatusCode(201);
    }

    public function destroy(Request $request, string $passkey, RevokePasskey $revokePasskey): Response
    {
        $revokePasskey->handle($this->authenticatedUser($request)->id, $passkey);

        return response()->noContent();
    }
}
