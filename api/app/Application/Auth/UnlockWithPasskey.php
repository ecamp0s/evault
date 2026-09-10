<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Verifies a passkey's derived hash and hands over the wrapper it opens. See ADR-021.
 *
 * It is the THIRD path into the vault, after the master password and the recovery key,
 * and it is the first that gets used every day rather than once.
 *
 * WHAT IT DOES NOT DO IS VERIFY WEBAUTHN, and that is the decision a reviewer will
 * question first. There is no challenge here, no signature and no public key: the
 * server receives a hash, exactly as it does from the recovery key. The argument is in
 * ADR-021 §2.4 — the PRF only exists after the authenticator verified the user, so
 * holding it IS the proof — and it rests on a premise this file cannot enforce: that a
 * token only ever buys ciphertext.
 */
final readonly class UnlockWithPasskey
{
    /**
     * The session token is issued by the same service the login and the sign-up use, and
     * that is not tidiness: AccessTokens explains that those two issue INDISTINGUISHABLE
     * tokens so that the token does not reveal how it was obtained. A third way in that
     * issued a token of its own would say «this session came from a passkey», and there
     * is nothing to gain by saying it.
     */
    public function __construct(private IssueSessionToken $issueSessionToken) {}

    /**
     * The shape of a bcrypt hash that no input validates against.
     *
     * The same trick as RecoverAccess: checking against it costs what checking against
     * a real one costs, so an account that does not exist takes as long as one that
     * does.
     */
    private const string DUMMY_HASH = '$2y$12$'.'00000000000000000000000000000000000000000000000000000';

    public function handle(string $email, string $authHash): PasskeyUnlockResult
    {
        $user = User::query()
            ->where('email', EmailAddress::normalize($email))
            ->with('passkeys')
            ->first();

        /** @var iterable<Passkey> $passkeys */
        $passkeys = $user instanceof User ? $user->passkeys : [];

        $matched = null;

        foreach ($passkeys as $passkey) {
            /*
             * NO break, AND IT IS THE POINT OF THE LOOP. Stopping at the match would
             * make the response time depend on WHICH passkey matched, so somebody
             * holding a valid one could work out its position in the list. Checking all
             * of them costs the same whichever it was.
             */
            if (Hash::check($authHash, $passkey->auth_hash)) {
                $matched = $passkey;
            }
        }

        /*
         * With no passkeys at all — the email is not registered, or it is and has none —
         * one check is still made against a hash nothing validates against. Otherwise
         * this endpoint would answer instantly for unknown addresses and slowly for
         * known ones, which is the difference the single answer of InvalidPasskey exists
         * to hide.
         */
        if ($matched === null) {
            Hash::check($authHash, self::DUMMY_HASH);

            throw new InvalidPasskey;
        }

        /*
         * WHAT THIS STILL LEAKS, AND WHY IT IS ACCEPTED. The work grows with the number
         * of passkeys on the account, so the response time says roughly how many there
         * are — and, for zero against one, whether the address is registered at all.
         *
         * Padding to a fixed count would mean choosing a number that is a ceiling on
         * something the design says has no ceiling, and paying for it on every unlock.
         * What closes it instead is the limiter: measuring a difference of one bcrypt
         * through network noise takes many samples, and this endpoint allows five
         * attempts an hour per address. See config/throttling.php.
         *
         * The alternative would be for the client to send its credential_id, turning
         * this into one lookup at constant cost. ADR-021 §4 ruled that out so as not to
         * say which credentials an account has, and that trade is worth revisiting the
         * day the instance stops being personal — but not silently.
         */

        /*
         * The only thing an unlock writes. It is metadata in the clear and it exists so
         * that somebody can tell their passkeys apart before revoking one.
         */
        $matched->forceFill(['last_used_at' => now()])->save();

        /*
         * Reaching here with a null $user is impossible — with no user there are no
         * passkeys and $matched stays null — but the compiler does not know that, and
         * one check too many on the authentication path is no waste. It is the same
         * belt-and-braces RecoverAccess carries.
         */
        if (! $user instanceof User) {
            throw new InvalidPasskey;
        }

        return new PasskeyUnlockResult(
            user: $user,
            vaultId: $matched->vault_id,
            wrappedKey: $matched->wrapped_key,
            wrappedKeyIv: $matched->wrapped_key_iv,
            token: $this->issueSessionToken->handle($user),
        );
    }
}
