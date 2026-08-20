<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Verifies a recovery key and hands over what only it opens. See ADR-010.
 *
 * It is the second path into the vault, and until this iteration there was only one.
 * Everything that was applied to the login applies here and with more reason, because
 * whoever calls is by definition somebody claiming to have lost their master password.
 *
 * What it returns is not a session: it is the encrypted material the recovery key
 * opens, plus a token good only for finishing the operation by setting a new master
 * password.
 */
final readonly class RecoverAccess
{
    public function handle(string $email, string $recoveryAuthHash): RecoveryResult
    {
        $user = User::query()
            ->where('email', EmailAddress::normalize($email))
            ->first();

        /*
         * The hash is checked ALWAYS, including when the user does not exist and when
         * they exist but have no recovery key. It is the same pattern as LoginUser and
         * for the same reason, which weighs more here: were leaving early to make the
         * difference measurable, this endpoint would say which emails are registered,
         * and on top of that which of them have a second key. The latter is something
         * the login does not leak and is not worth starting to.
         *
         * The dummy hash has the shape of a real one so that the check costs the same.
         */
        $storedHash = '$2y$12$'.str_repeat('0', 53);

        if ($user instanceof User && $user->recovery_auth_hash !== null) {
            $storedHash = $user->recovery_auth_hash;
        }

        if (! Hash::check($recoveryAuthHash, $storedHash)) {
            throw new InvalidRecoveryKey;
        }

        /*
         * Getting here with a null $user is impossible — the dummy hash never validates
         * — but the compiler does not know that, and one check too many on the
         * authentication path is no waste.
         */
        if (! $user instanceof User) {
            throw new InvalidRecoveryKey;
        }

        $wrappedKeys = [];

        foreach ($user->vaults as $vault) {
            $wrapped = $vault->pivot->recovery_wrapped_key;
            $iv = $vault->pivot->recovery_wrapped_key_iv;

            /*
             * A vault with no recovery wrapper is skipped instead of breaking the
             * response. It can genuinely happen: the key was registered when the user
             * had one vault and afterwards they joined another, a scenario that arrives
             * with shared vaults. Whatever opens is handed over; whatever does not is
             * not invented.
             */
            if ($wrapped === null || $iv === null) {
                continue;
            }

            $wrappedKeys[] = [
                'vault_id' => $vault->id,
                'recovery_wrapped_key' => $wrapped,
                'recovery_wrapped_key_iv' => $iv,
            ];
        }

        /*
         * A token with a single ability and a short life. It cannot read items or list
         * vaults: the ordinary routes demand `*` and this one does not carry it.
         */
        $token = $user->createToken(
            AccessTokens::RECOVERY_NAME,
            [AccessTokens::RECOVERY_ABILITY],
            now()->addMinutes(AccessTokens::RECOVERY_MINUTES),
        )->plainTextToken;

        return new RecoveryResult($user, $wrappedKeys, $token);
    }
}
