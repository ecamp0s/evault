<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Support\Facades\DB;

/**
 * Changes the authentication hash and re-wraps the vault key. See ADR-008.
 *
 * It is the dividend that ADR bought by deciding the master key would not encrypt the
 * items but wrap a vault key: changing the master password is rewriting a few bytes,
 * not re-encrypting the whole vault. The items are not touched, so they do not even
 * have to be read.
 *
 * It does NOT verify who is calling, and that is deliberate: two different paths use
 * this service and each proves identity its own way. The ordinary change checks the
 * current authentication hash; the recovery of ADR-010 arrives with a single-use token
 * that already proved possession of the recovery key, and cannot supply a current hash
 * because that is precisely what has been lost. Putting the verification here would
 * force one of the two to fake it.
 *
 * What it does always is write everything together or write nothing.
 */
final readonly class RotateMasterPassword
{
    /**
     * @param  array<string, WrappedVaultKey>  $wrappedKeys  keyed by vault_id
     * @param  int|null  $keepTokenId  the token that survives, if any
     */
    public function handle(
        int $userId,
        string $newAuthHash,
        array $wrappedKeys,
        ?int $keepTokenId = null,
    ): void {
        /*
         * ALL TOGETHER, and it is the point that makes this service dangerous.
         *
         * The two possible half-done states are beyond repair from the server, which
         * holds none of the keys. With the password changed and the old wrapper, the
         * user gets in and their new master key opens nothing: the vault stays shut
         * with their data inside. With the new wrapper and the old password, they do
         * not even get in.
         *
         * There is a test that forces the failure between the two writes.
         */
        DB::transaction(function () use ($userId, $newAuthHash, $wrappedKeys, $keepTokenId): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            foreach ($wrappedKeys as $vaultId => $wrappedKey) {
                /*
                 * Always scoped by user_id, which is the second barrier of the double
                 * guard and what ADR-004 demands. A vault_id belonging to somebody else
                 * writes nothing instead of writing into their row.
                 */
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->where('vault_id', $vaultId)
                    ->update([
                        'wrapped_key' => $wrappedKey->ciphertext,
                        'wrapped_key_iv' => $wrappedKey->iv,
                    ]);
            }

            // The model's 'hashed' cast takes care of it; the received value is not stored.
            $user->password = $newAuthHash;
            $user->save();

            /*
             * The other tokens fall. It is half the reason this operation exists:
             * whoever changes their master password suspecting a theft expects the
             * other device to lose access, and without this it would keep getting in
             * on the token it already had, because a live token never looks at the
             * password again.
             *
             * The one of the request in flight survives when it is passed in. Evicting
             * somebody who has just proven they know the old password and chosen the
             * new one protects against nothing, and would force them to derive again
             * and reopen the vault for no reason. In the recovery none is passed,
             * because there the token is single-use and has to die here.
             */
            PersonalAccessToken::query()
                ->where('tokenable_id', $userId)
                ->where('tokenable_type', User::class)
                ->when($keepTokenId !== null, fn ($query) => $query->whereKeyNot($keepTokenId))
                ->delete();
        });
    }
}
