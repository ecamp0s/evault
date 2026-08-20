<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Support\Facades\DB;

/**
 * Creating a user's personal vault and their membership as its owner.
 *
 * It takes the identifier as a parameter and touches neither the session nor the
 * authenticated user, following ADR-004: the API is stateless and the context travels
 * explicitly on every call.
 *
 * The name is set by the server and is a fixed literal. The project's language policy
 * leaves user-facing text to the client, so this value is an internal label and not
 * something meant to be painted as it stands.
 *
 * A warning for when shared vaults arrive: the name is a plaintext column, readable by
 * the server. Today it says nothing because it is always the same, but a name written
 * by the user would be metadata, and it will have to be decided then whether it travels
 * inside the blob.
 */
final readonly class CreatePersonalVault
{
    private const string NOMBRE = 'Personal';

    public function handle(int $userId, WrappedVaultKey $wrappedKey): Vault
    {
        return DB::transaction(function () use ($userId, $wrappedKey): Vault {
            /*
             * Idempotent on purpose: if one already exists, the existing one is
             * returned instead of crashing into the unique index. A retry of the
             * sign-up must not turn into a 500, and this way the service also serves to
             * repair a user who had ended up without a vault.
             *
             * lockForUpdate closes the window between this query and the insert, as
             * RegisterUser does with the uniqueness of the email. The real guarantee is
             * the unique index; this only avoids reaching it.
             */
            $existing = Vault::query()
                ->where('personal_for_user_id', $userId)
                ->lockForUpdate()
                ->first();

            if ($existing instanceof Vault) {
                /*
                 * The wrapped key that arrives is discarded, and it is the only thing
                 * this service can do without causing harm. Overwriting it would leave
                 * that vault's items encrypted under a key nobody holds any more, and
                 * that cannot be undone even with the right password. Re-wrapping the
                 * existing key is another operation, the master password change, and it
                 * needs the old key to be done properly.
                 */
                return $existing;
            }

            $vault = Vault::query()->create([
                'name' => self::NOMBRE,
                'personal_for_user_id' => $userId,
            ]);

            $vault->members()->attach($userId, [
                'role' => VaultRole::Owner->value,
                'wrapped_key' => $wrappedKey->ciphertext,
                'wrapped_key_iv' => $wrappedKey->iv,
            ]);

            return $vault;
        });
    }
}
