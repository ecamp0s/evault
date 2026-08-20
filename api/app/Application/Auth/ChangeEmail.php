<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Changing the email address. See ADR-014.
 *
 * The email is NOT a profile field: by ADR-008 it is the salt the master key and the
 * recovery keys are derived from. Changing it forces a re-derivation and a re-wrap,
 * and that is why this looks far more like RotateMasterPassword than like updating a
 * field.
 *
 * What does NOT change is the vault key, and there ADR-008's dividend is collected
 * again: the items are not touched, so the operation costs the same with three entries
 * as with three thousand.
 */
final readonly class ChangeEmail
{
    /**
     * @param  array<string, WrappedVaultKey>  $wrappedKeys  keyed by vault_id
     * @param  array<string, WrappedVaultKey>  $recoveryWrappedKeys  keyed by vault_id, empty when there are none
     * @param  int|null  $keepTokenId  the token that survives, if any
     */
    public function handle(
        int $userId,
        string $newEmail,
        string $newAuthHash,
        array $wrappedKeys,
        ?string $recoveryAuthHash = null,
        array $recoveryWrappedKeys = [],
        ?int $keepTokenId = null,
    ): void {
        /*
         * ALL TOGETHER, for the same reason as in RotateMasterPassword and with one
         * more half-done state, because here there are four writes and not three.
         *
         * The worst of them is the email changed with the old wrappers: the user signs
         * in with their new email, derives a different master key, and that key opens
         * nothing. The vault stays shut with their data inside and the server cannot
         * repair it, because it holds none of the keys.
         *
         * There is a test that forces an exception between writes and checks nothing
         * is left half done.
         */
        DB::transaction(function () use (
            $userId,
            $newEmail,
            $newAuthHash,
            $wrappedKeys,
            $recoveryAuthHash,
            $recoveryWrappedKeys,
            $keepTokenId
        ): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            foreach ($wrappedKeys as $vaultId => $wrappedKey) {
                /*
                 * Always scoped by user_id: the second barrier of the double guard,
                 * which ADR-004 demands. A vault_id belonging to somebody else writes
                 * nothing instead of writing into their row.
                 */
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->where('vault_id', $vaultId)
                    ->update([
                        'wrapped_key' => $wrappedKey->ciphertext,
                        'wrapped_key_iv' => $wrappedKey->iv,
                    ]);
            }

            /*
             * The recovery wrapper, which is what tells this operation apart from a
             * password rotation.
             *
             * Rotating the password does NOT touch the recovery key, because the vault
             * key does not change. Changing the email DOES invalidate it, because the
             * email is the salt of the HKDF its wrapping key and its hash come out of.
             * That is why it has to be remade or deleted here: leaving it as it stands
             * would leave the user with a second key that no longer opens and that they
             * believe opens.
             *
             * See ADR-014 §2.1: whoever had a recovery key gets a new one inside the
             * same operation; one is not invented for whoever had none.
             *
             * AND IF NONE ARRIVES, THE OLD ONE IS DELETED rather than kept. It is the
             * least obvious decision of this service and the one that avoids the worst
             * ending: a wrapper that can no longer be opened, stored as if it worked,
             * and a user convinced they have a safety net. With no recovery key you are
             * in the earlier model, which ADR-010 considers legitimate; with one that
             * does not open, you are in neither.
             */
            if ($recoveryAuthHash !== null) {
                foreach ($recoveryWrappedKeys as $vaultId => $wrappedKey) {
                    VaultMember::query()
                        ->where('user_id', $userId)
                        ->where('vault_id', $vaultId)
                        ->update([
                            'recovery_wrapped_key' => $wrappedKey->ciphertext,
                            'recovery_wrapped_key_iv' => $wrappedKey->iv,
                        ]);
                }

                $user->recovery_auth_hash = $recoveryAuthHash;
            } else {
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->update([
                        'recovery_wrapped_key' => null,
                        'recovery_wrapped_key_iv' => null,
                    ]);

                $user->recovery_auth_hash = null;
            }

            $user->email = $newEmail;
            // The model's 'hashed' cast takes care of it; the received value is not stored.
            $user->password = $newAuthHash;
            $user->save();

            /*
             * The other tokens fall, as when rotating the password: the email is part
             * of the credentials, and whoever changes it expects sessions open
             * elsewhere to stop working. The one of the request in flight survives when
             * it is passed in, because evicting somebody who has just proven they know
             * the password protects against nothing.
             */
            PersonalAccessToken::query()
                ->where('tokenable_id', $userId)
                ->where('tokenable_type', User::class)
                ->when($keepTokenId !== null, fn ($query) => $query->whereKeyNot($keepTokenId))
                ->delete();
        });
    }
}
