<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\ChangeEmail;
use App\Application\Auth\EmailAddress;
use App\Application\Auth\InvalidCredentials;
use App\Application\Vaults\VaultNotAccessible;
use App\Application\Vaults\WrappedVaultKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\EmailRequest;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;

/**
 * Changing the email address. See ADR-014.
 *
 * The email is the salt of the derivation (ADR-008), so this does not update a field:
 * it re-derives. The check that whoever asks knows the current password lives here, as
 * in the master password change; the re-wrapping and the writes are done by the
 * service.
 */
final class EmailController extends Controller
{
    public function update(EmailRequest $request, ChangeEmail $changeEmail): Response
    {
        $user = $this->authenticatedUser($request);

        /*
         * A valid session is not enough. A stolen token cannot be used to change the
         * email and lock the owner out, so proving knowledge of the current master
         * password is required.
         */
        if (! Hash::check($request->string('current_password')->toString(), $user->password)) {
            throw new InvalidCredentials;
        }

        $newEmail = EmailAddress::normalize($request->string('email')->toString());

        /*
         * AN ALREADY REGISTERED EMAIL ANSWERS LIKE A WRONG PASSWORD, and that is
         * deliberate: were the answer different, anybody with a session could work out
         * which emails exist in the instance by trying them one at a time.
         *
         * It is the same care ADR-008 took when discarding the prelogin endpoint and
         * that #126 took in the recovery one. There is a test that COMPARES the two
         * responses instead of checking each on its own, which is the only way this
         * does not break without anybody noticing.
         *
         * One's own email does not count as taken: changing to what you already have is
         * an operation with no effect, not a conflict.
         */
        $taken = User::query()
            ->where('email', $newEmail)
            ->whereKeyNot($user->id)
            ->exists();

        if ($taken) {
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
         * Re-wrapping EVERY vault is required, not whichever ones one feels like
         * sending. Leaving one out leaves it wrapped under a master key derived from an
         * email that no longer exists, and that does not show until somebody tries to
         * open it.
         */
        if (count($wrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        /** @var list<array{vault_id: string, recovery_wrapped_key: string, recovery_wrapped_key_iv: string}> $recoveryEntries */
        $recoveryEntries = $request->array('recovery_wrapped_keys');
        $recoveryWrappedKeys = [];

        foreach ($recoveryEntries as $entry) {
            if (! in_array($entry['vault_id'], $own, strict: true)) {
                throw new VaultNotAccessible;
            }

            $recoveryWrappedKeys[$entry['vault_id']] = new WrappedVaultKey(
                ciphertext: $entry['recovery_wrapped_key'],
                iv: $entry['recovery_wrapped_key_iv'],
            );
        }

        $recoveryAuthHash = $request->string('recovery_auth_hash')->toString();

        // The same criterion as above: either every recovery wrapper is remade or
        // none of them is.
        if ($recoveryAuthHash !== '' && count($recoveryWrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        // See the comment in MasterPasswordController on why the value is checked and
        // not the type: actingAs fabricates a token with no row behind it.
        $currentTokenId = $user->currentAccessToken()->id ?? null;

        $changeEmail->handle(
            userId: $user->id,
            newEmail: $newEmail,
            newAuthHash: $request->string('password')->toString(),
            wrappedKeys: $wrappedKeys,
            recoveryAuthHash: $recoveryAuthHash !== '' ? $recoveryAuthHash : null,
            recoveryWrappedKeys: $recoveryWrappedKeys,
            keepTokenId: is_int($currentTokenId) ? $currentTokenId : null,
        );

        return response()->noContent();
    }
}
