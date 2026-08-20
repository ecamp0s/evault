<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Illuminate\Http\Request;

/**
 * The keys authentication attempts are counted under.
 *
 * It exists as a shared class because the key is used in two places that have to
 * match exactly: the limiter that increments it, and the successful login that
 * clears it. Were they to diverge, a success would not clear the counter of the
 * failure and the user would end up locked out despite getting in.
 */
final class AttemptKey
{
    /**
     * Login: IP plus email.
     *
     * By IP alone, a shared NAT would lock out legitimate users whenever any one of
     * them is attacked. By email alone, anybody could lock somebody else's account
     * at will. The combination avoids both.
     */
    public static function login(Request $request): string
    {
        // string() and not a cast over input(): it returns a typed Stringable, and
        // converts without surprises when the client sends something that is not text.
        $email = EmailAddress::normalize($request->string('email')->toString());

        return 'auth.login|'.$request->ip().'|'.$email;
    }

    /**
     * Registration: IP only.
     *
     * Including the email would be pointless: whoever creates accounts in bulk uses a
     * different one every time and would never reach the limit.
     */
    public static function register(Request $request): string
    {
        return 'auth.register|'.$request->ip();
    }

    /**
     * Changing the master password: by authenticated user, not by IP.
     *
     * Here it is known who is calling, because the route demands a session. Counting
     * by IP would let an attacker holding a stolen token spend the limit of everyone
     * sharing a way out to the internet.
     */
    public static function masterPassword(Request $request): string
    {
        $user = $request->user();

        return 'auth.master-password|'.($user instanceof User ? $user->id : $request->ip());
    }

    /**
     * Changing the email: by authenticated user, for the same reason as above.
     */
    public static function email(Request $request): string
    {
        $user = $request->user();

        return 'auth.email|'.($user instanceof User ? $user->id : $request->ip());
    }

    /**
     * Recovery: IP plus email, by the same balance as the login.
     *
     * The docblock explaining this used to sit two methods above, orphaned from its
     * own code, and it said the name here was in English while the ones above were
     * not. That stopped being true when #119 finished migrating them, on 4 August
     * 2026 — a comment describing a state that no longer exists.
     */
    public static function recovery(Request $request): string
    {
        $email = EmailAddress::normalize($request->string('email')->toString());

        return 'auth.recovery|'.$request->ip().'|'.$email;
    }
}
