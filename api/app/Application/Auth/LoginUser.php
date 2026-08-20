<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Verifying credentials and issuing a new token.
 *
 * It touches neither the session nor any stateful guard: the API is stateless and the
 * token is the only credential. See ADR-004.
 */
final readonly class LoginUser
{
    public function __construct(private IssueSessionToken $issueSessionToken) {}

    public function handle(string $email, string $password): AuthResult
    {
        $user = User::query()
            ->where('email', EmailAddress::normalize($email))
            ->first();

        /*
         * The hash is checked even when the user does not exist, against a dummy hash.
         * Were it to leave early, the response to an unregistered email would be
         * measurably faster than the one to a registered email with a wrong password,
         * and that difference allows enumerating accounts.
         */
        if ($user === null) {
            Hash::check($password, '$2y$12$'.str_repeat('0', 53));

            throw new InvalidCredentials;
        }

        if (! Hash::check($password, $user->password)) {
            throw new InvalidCredentials;
        }

        return new AuthResult($user, $this->issueSessionToken->handle($user));
    }
}
