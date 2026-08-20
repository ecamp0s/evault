<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\InvalidCredentials;
use App\Application\Auth\RotateMasterPassword;
use App\Application\Vaults\VaultNotAccessible;
use App\Application\Vaults\WrappedVaultKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\MasterPasswordRequest;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;

/**
 * Changing the master password. See ADR-008.
 *
 * Here lives the one thing this path does not share with the recovery of ADR-010: the
 * check that whoever asks for the change knows the password in place. The re-wrapping
 * and the write are done by the service, which is the same for both.
 */
final class MasterPasswordController extends Controller
{
    public function update(
        MasterPasswordRequest $request,
        RotateMasterPassword $rotateMasterPassword,
    ): Response {
        $user = $this->authenticatedUser($request);

        /*
         * A valid session is not enough. A stolen token would open the door to changing
         * the master password and locking the owner out, so proving knowledge of the
         * current one is required.
         *
         * It is the same InvalidCredentials exception the login uses, and with the same
         * message: there is nothing to tell apart here, whoever fails is whoever does
         * not know the password.
         */
        if (! Hash::check($request->string('current_password')->toString(), $user->password)) {
            throw new InvalidCredentials;
        }

        /** @var list<array{vault_id: string, wrapped_key: string, wrapped_key_iv: string}> $entries */
        $entries = $request->array('wrapped_keys');

        /*
         * First barrier of the double guard: every vault has to be theirs before any is
         * written. The second lives in the service, which scopes every write by
         * user_id.
         */
        $own = $user->vaults()->pluck('vaults.id')->all();

        $wrappedKeys = [];

        foreach ($entries as $entry) {
            if (! in_array($entry['vault_id'], $own, strict: true)) {
                // 404 and not 403, as in the rest of the project: a 403 would confirm
                // that the identifier exists.
                throw new VaultNotAccessible;
            }

            $wrappedKeys[$entry['vault_id']] = new WrappedVaultKey(
                ciphertext: $entry['wrapped_key'],
                iv: $entry['wrapped_key_iv'],
            );
        }

        /*
         * Re-wrapping EVERY one of the user's vaults is required, not whichever ones
         * they feel like sending. Leaving one out leaves it wrapped under a master key
         * that no longer exists, and that does not show until somebody tries to open it.
         */
        if (count($wrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        /*
         * This request's token survives; the other devices do not.
         *
         * The VALUE is checked and not the type, though the type would look sufficient:
         * a token that does not come from the database — the one actingAs fabricates in
         * the tests — is a PersonalAccessToken all the same, but with no row behind it,
         * and reading its identifier returns false instead of null. Settling for the
         * instanceof let that false through as far as the service's signature.
         *
         * With no identifier every token falls, which is the right thing when there is
         * no particular session to keep.
         */
        $currentTokenId = $user->currentAccessToken()->id ?? null;

        $rotateMasterPassword->handle(
            userId: $user->id,
            newAuthHash: $request->string('password')->toString(),
            wrappedKeys: $wrappedKeys,
            keepTokenId: is_int($currentTokenId) ? $currentTokenId : null,
        );

        return response()->noContent();
    }
}
