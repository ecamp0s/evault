<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\CreatePersonalVault;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Signing a user up, creating their personal vault and issuing their first token.
 *
 * On the $password field: since Iteration 3 what arrives is no longer the user's
 * password but the authentication hash the client derived from it, and the server
 * treats it exactly as before because to it, it is still a string to hash. That
 * continuity is precisely what ADR-001 asked to preserve when it demanded the contract
 * stay stable from Iteration 1.
 *
 * The master password does not arrive here, nor anywhere else on the server.
 *
 * The wrapped key arrives alongside the sign-up and not in a separate call because a
 * user with a vault and no wrapped key can open nothing, so both things have to be
 * born or fail together. See ADR-008.
 */
final readonly class RegisterUser
{
    public function __construct(
        private CreatePersonalVault $createPersonalVault,
        private IssueSessionToken $issueSessionToken,
    ) {}

    public function handle(
        string $name,
        string $email,
        string $password,
        WrappedVaultKey $wrappedKey,
    ): AuthResult {
        /*
         * The same normalisation the client applies before deriving. Not a courtesy:
         * the email is the salt of the derivation, so were the two normalisations to
         * stop agreeing, the user would get a different authentication hash on signing
         * in and would not get in. See ADR-008.
         */
        $email = EmailAddress::normalize($email);

        return DB::transaction(function () use ($name, $email, $password, $wrappedKey): AuthResult {
            // Double guard: the Form Request already applied the unique rule, but
            // between that query and this insert another request with the same email
            // fits. lockForUpdate closes that window inside the transaction.
            if (User::query()->where('email', $email)->lockForUpdate()->exists()) {
                throw new EmailAlreadyRegistered;
            }

            $user = User::query()->create([
                'name' => trim($name),
                'email' => $email,
                // The model's 'hashed' cast takes care of hashing.
                'password' => $password,
            ]);

            /*
             * Inside the same transaction, on purpose: the rest of the project takes
             * for granted that every user has a vault. If this fails, having no user
             * beats having an unusable one that would need repairing by hand. Since
             * ADR-008 the argument is stronger still: without the wrapped key written
             * here, the account can open nothing and there is no way to repair it,
             * because the key is on the device of whoever signed up and nowhere else.
             */
            $this->createPersonalVault->handle($user->id, $wrappedKey);

            return new AuthResult($user, $this->issueSessionToken->handle($user));
        });
    }
}
