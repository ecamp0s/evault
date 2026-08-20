<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\RecoverAccess;
use App\Application\Auth\RotateMasterPassword;
use App\Application\Auth\SetRecoveryKey;
use App\Application\Vaults\VaultNotAccessible;
use App\Application\Vaults\WrappedVaultKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\CompleteRecoveryRequest;
use App\Http\Requests\Auth\RecoverRequest;
use App\Http\Requests\Auth\RecoveryKeyRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * The two recovery-key endpoints. See ADR-010.
 *
 * They live in a controller of their own and not in AuthController because they are
 * not part of the session cycle: one is used once when setting up the account and the
 * other only on the day something has gone wrong.
 *
 * There is no logic here, as in the rest of the project's controllers: the request is
 * translated into a call to the application service and the result into JSON.
 */
final class RecoveryController extends Controller
{
    /**
     * Registers or replaces the authenticated user's recovery key.
     *
     * It demands an ordinary session — that is, somebody who has just proven they know
     * their master password. The recovery token is not enough: whoever arrives with
     * that has not yet proven they know any password, and letting them rotate the
     * second key would turn a theft of the paper into an eviction of the owner.
     */
    public function store(RecoveryKeyRequest $request, SetRecoveryKey $setRecoveryKey): Response
    {
        $user = $this->authenticatedUser($request);

        /** @var list<array{vault_id: string, recovery_wrapped_key: string, recovery_wrapped_key_iv: string}> $entries */
        $entries = $request->array('wrapped_keys');

        /*
         * First barrier of the double guard: every vault is checked to be theirs
         * BEFORE any is written. The second lives in the service, which scopes every
         * write by user_id.
         *
         * They are all checked up front and not one by one along the way because the
         * service writes inside a transaction: failing halfway would abort it, but it
         * is more honest to refuse the whole request without having started.
         */
        $ownVaultIds = $user->vaults()->pluck('vaults.id')->all();

        $wrappedKeys = [];

        foreach ($entries as $entry) {
            if (! in_array($entry['vault_id'], $ownVaultIds, strict: true)) {
                /*
                 * 404 and not 403, as in the rest of the project: a 403 would confirm
                 * that the identifier exists.
                 */
                throw new VaultNotAccessible;
            }

            $wrappedKeys[$entry['vault_id']] = new WrappedVaultKey(
                ciphertext: $entry['recovery_wrapped_key'],
                iv: $entry['recovery_wrapped_key_iv'],
            );
        }

        $setRecoveryKey->handle(
            userId: $user->id,
            recoveryAuthHash: $request->string('recovery_auth_hash')->toString(),
            wrappedKeys: $wrappedKeys,
        );

        return response()->noContent();
    }

    /**
     * Hands the recovery wrappers to whoever proves they hold the key.
     *
     * Public and rate limited. What it returns opens nothing on its own: they are blobs
     * only the recovery key can decrypt, and the server cannot either.
     */
    public function recover(RecoverRequest $request, RecoverAccess $recoverAccess): JsonResponse
    {
        $result = $recoverAccess->handle(
            email: $request->string('email')->toString(),
            recoveryAuthHash: $request->string('recovery_auth_hash')->toString(),
        );

        return response()->json([
            'data' => [
                'user' => UserResource::make($result->user),
                'wrapped_keys' => $result->wrappedKeys,
                'token' => $result->token,
            ],
        ]);
    }

    /**
     * Finishes the recovery by setting a new master password.
     *
     * Only the single-use token handed out by recover() reaches it, because the route
     * asks for that ability and no other. It reuses the password-change service from
     * #124 instead of reimplementing the re-wrap: ADR-010 asks for that expressly, and
     * two implementations of the same re-wrap are two places to lose somebody's vault.
     *
     * It does not ask for the current hash, and that absence is the reason this
     * endpoint exists apart: whoever gets here has lost precisely that.
     */
    public function complete(
        CompleteRecoveryRequest $request,
        RotateMasterPassword $rotateMasterPassword,
    ): Response {
        $user = $this->authenticatedUser($request);

        /** @var list<array{vault_id: string, wrapped_key: string, wrapped_key_iv: string}> $entries */
        $entries = $request->array('wrapped_keys');

        $own = $user->vaults()->pluck('vaults.id')->all();

        $wrappedKeys = [];

        foreach ($entries as $entry) {
            if (! in_array($entry['vault_id'], $own, strict: true)) {
                throw new VaultNotAccessible;
            }

            $wrappedKeys[$entry['vault_id']] = new WrappedVaultKey(
                ciphertext: $entry['wrapped_key'],
                iv: $entry['wrapped_key_iv'],
            );
        }

        if (count($wrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        /*
         * No token to keep: they all fall, the single-use one that got here included.
         * Whoever recovers signs in again with their new password, which is what proves
         * they really did set it.
         */
        $rotateMasterPassword->handle(
            userId: $user->id,
            newAuthHash: $request->string('password')->toString(),
            wrappedKeys: $wrappedKeys,
        );

        return response()->noContent();
    }
}
