<?php

declare(strict_types=1);

namespace App\Application\Auth;

/**
 * The canonical form of an email address.
 *
 * THIS IS NOT A COURTESY OF THE INTERFACE: IT IS PART OF THE CRYPTOGRAPHIC CONTRACT.
 *
 * By ADR-008 the email is the SALT the master key is derived from, so client and
 * server have to normalise it exactly alike or the derivation does not match. When it
 * does not match, the failure is not an error: it is a user typing their good password
 * and getting «wrong credentials», or worse, a vault that stops opening with nothing
 * having warned.
 *
 * The counterpart in the client is normalizeEmail() in web/src/lib/vault/crypto.ts,
 * and there is a test pinning that the two do the same. If one changes, so does the
 * other.
 *
 * IT LIVES HERE AND NOT REPEATED IN EVERY PLACE since #221, which is when there was
 * going to be a sixth use. Before that it was copied into RegisterUser, LoginUser,
 * RecoverAccess and twice into AttemptKey, with nothing checking that the five were
 * still identical. What made it dangerous is not the duplication: it is that a copy
 * that drifted would BREAK NO TEST and would show up as a vault that does not open,
 * with the place to look very far from the place of the problem.
 */
final class EmailAddress
{
    /**
     * Lowercase and with no surrounding spaces.
     *
     * `mb_strtolower` and not `strtolower`, because the second only lowers ASCII and
     * would leave an address written in capitals with an accent in it half normalised.
     *
     * What is NOT done here, and it is worth saying because it looks like an omission:
     * no stripping of dots or `+` suffixes, even though some providers treat them as
     * equivalent. Two emails a provider considers the same are two different salts, and
     * «fixing» it would lock out of their vault whoever signed up with the variant
     * discarded here.
     */
    public static function normalize(string $email): string
    {
        return mb_strtolower(trim($email));
    }
}
