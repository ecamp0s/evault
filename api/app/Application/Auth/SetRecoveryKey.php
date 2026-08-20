<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\DB;

/**
 * Registers or replaces a user's recovery key. See ADR-010.
 *
 * It serves both operations because they are the same write: generating for the first
 * time and regenerating differ only in whether there was something before. When it
 * finishes, the previous recovery key stops working.
 *
 * It takes the identifier as a parameter and does not touch the session, following
 * ADR-004.
 *
 * The server can validate nothing of what arrives: neither that the wrappers really
 * open, nor that the hash belongs to the key that wrapped them. They are opaque blobs,
 * like wrapped_key and ciphertext. All it checks is that the writes land on vaults the
 * user is a member of.
 */
final readonly class SetRecoveryKey
{
    /**
     * @param  array<string, WrappedVaultKey>  $wrappedKeys  keyed by vault_id
     */
    public function handle(int $userId, string $recoveryAuthHash, array $wrappedKeys): void
    {
        /*
         * Everything inside a transaction, and it is the delicate point of this
         * service.
         *
         * Writing the hash without the wrappers leaves somebody who authenticates with
         * their recovery key and then cannot open anything. Writing the wrappers
         * without the hash leaves the opposite. Both states are a recovery that does
         * not work, and the worst of that class of failure is that it is not discovered
         * until the day it is needed, when there is no other way left.
         *
         * There is a test that forces the failure between the two writes and checks
         * nothing is left half done.
         */
        DB::transaction(function () use ($userId, $recoveryAuthHash, $wrappedKeys): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            foreach ($wrappedKeys as $vaultId => $wrappedKey) {
                /*
                 * Scoped by user_id, always. It is the barrier that stops a write from
                 * landing in somebody else's row by passing their vault_id, and ADR-004
                 * makes it mandatory: every query touching user data carries its scope.
                 *
                 * update() returns the number of rows affected, so a vault_id belonging
                 * to somebody else, or one that does not exist, writes nothing and does
                 * not blow up. The controller has already checked membership; this is
                 * the second guard.
                 */
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->where('vault_id', $vaultId)
                    ->update([
                        'recovery_wrapped_key' => $wrappedKey->ciphertext,
                        'recovery_wrapped_key_iv' => $wrappedKey->iv,
                    ]);
            }

            // The model's 'hashed' cast takes care of hashing, as with password. The
            // value that arrived is never stored.
            $user->recovery_auth_hash = $recoveryAuthHash;
            $user->save();
        });
    }
}
