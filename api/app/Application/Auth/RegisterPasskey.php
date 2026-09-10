<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\Passkey;
use App\Models\User;

/**
 * Registers a passkey for a user, with its wrapper of one vault. See ADR-021.
 *
 * It takes the identifiers as parameters and does not touch the session, following
 * ADR-004.
 *
 * WHAT THE SERVER CANNOT CHECK, and it is the same exception already on record for the
 * items and for the recovery wrappers: neither that the wrapper really opens, nor that
 * the hash belongs to the PRF that produced it, nor that any of this came from a real
 * authenticator. They are opaque blobs. What it does check is that the vault belongs to
 * whoever is writing.
 *
 * THERE IS NO TRANSACTION HERE AND THAT IS THE RESULT, NOT AN OMISSION. SetRecoveryKey
 * needs one because its material is split across two tables, so a failure between the
 * two writes leaves a recovery that does not work and nobody finds out until the day it
 * is needed. Here the credential, its hash and its wrapper are one row, so the atomicity
 * comes from the insert. Wrapping a single write in a transaction would suggest a danger
 * that the shape of the table already removed — which is why #558 chose that shape.
 */
final readonly class RegisterPasskey
{
    public function handle(
        int $userId,
        string $vaultId,
        string $credentialId,
        string $label,
        string $rpId,
        string $authHash,
        string $wrappedKey,
        string $wrappedKeyIv,
    ): Passkey {
        $user = User::query()->findOrFail($userId);

        /*
         * Second guard: the vault is looked up THROUGH the user's relation, so one
         * belonging to somebody else simply is not found. The controller has already
         * checked it; this is the barrier that does not depend on the controller having
         * remembered to.
         */
        if (! $user->vaults()->whereKey($vaultId)->exists()) {
            throw new PasskeyNotFound;
        }

        /*
         * Checked before writing so that a repeat comes back as 409 and not as the 500
         * a unique-index violation would produce. The index stays as the authority: two
         * requests racing each other would still collide there, and that is the right
         * place for it — this check is for the case that actually happens, which is
         * somebody adding the same device twice.
         */
        if (Passkey::query()->where('credential_id', $credentialId)->exists()) {
            throw new PasskeyAlreadyRegistered;
        }

        /*
         * Created THROUGH the relation, and it is not a stylistic preference: user_id is
         * deliberately absent from the model's $fillable, so that no request body can
         * ever set it by mass assignment. The relation fills it from the user this
         * service was handed, which is the only source that can be trusted.
         *
         * The 'hashed' cast takes care of authHash, as with password: the value that
         * arrived is never stored.
         */
        return $user->passkeys()->create([
            'vault_id' => $vaultId,
            'credential_id' => $credentialId,
            'label' => $label,
            'rp_id' => $rpId,
            'auth_hash' => $authHash,
            'wrapped_key' => $wrappedKey,
            'wrapped_key_iv' => $wrappedKeyIv,
        ]);
    }
}
