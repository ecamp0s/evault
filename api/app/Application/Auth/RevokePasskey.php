<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\Passkey;

/**
 * Revokes one of a user's passkeys. See ADR-021.
 *
 * REVOKING IS DELETING THE ROW AND NOTHING ELSE, which is what makes it cheap and is a
 * property of the design rather than a shortcut. The credential may well go on existing
 * in the person's keychain, and it stops opening anything the moment its wrapper is
 * gone. Nothing has to be re-encrypted, no item is touched and no session is revoked,
 * because the vault key never changed.
 *
 * It does not touch the others: each passkey wraps the same vault key on its own, so
 * losing a laptop costs one row and not a reconfiguration.
 */
final readonly class RevokePasskey
{
    public function handle(int $userId, string $passkeyId): void
    {
        /*
         * Scoped by user_id, always — ADR-004. Deleting by id alone would let anybody
         * who guessed an identifier revoke somebody else's passkey, which is a denial
         * of access to their own vault.
         */
        $deleted = Passkey::query()
            ->where('user_id', $userId)
            ->whereKey($passkeyId)
            ->delete();

        /*
         * Not found and not yours are the same answer. Telling them apart would say
         * whether an identifier exists, and this endpoint would become the oracle that
         * PasskeyNotFound exists to prevent.
         */
        if ($deleted === 0) {
            throw new PasskeyNotFound;
        }
    }
}
