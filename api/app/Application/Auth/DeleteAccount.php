<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Deleting an account, everything of it, at once. See ADR-024.
 *
 * THE PROOF IS CHECKED HERE AND NOT ONLY IN THE CONTROLLER, unlike rotating the master
 * password, where two paths prove identity in two ways. This is the most destructive
 * operation there is, and ADR-024 §4 does not let its second barrier depend on who calls
 * it: whoever reaches this service with somebody's id still needs that somebody's
 * authentication hash and email.
 *
 * A wrong hash and a wrong email answer the same InvalidCredentials: telling them apart
 * would say which half was right.
 *
 * WHAT IT DELETES BY ITSELF AND WHAT THE SCHEMA DELETES. The tokens, by hand: the table
 * is polymorphic and has no foreign key, so nothing cascades into it. Everything else
 * hangs off `users` with cascadeOnDelete —the personal vault, and from it its members
 * with their wrappers, its items live and in the bin, and its passkeys— and there is a
 * test that checks it table by table rather than trusting this sentence.
 *
 * Nothing is written about the account having existed (ADR-024 §2.6).
 */
final readonly class DeleteAccount
{
    /**
     * @throws InvalidCredentials
     */
    public function handle(int $userId, string $authHash, string $email): void
    {
        DB::transaction(function () use ($userId, $authHash, $email): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            // Both checks always run, so the time does not say which one failed.
            $knowsThePassword = Hash::check($authHash, $user->password);
            $namedThisAccount = EmailAddress::normalize($email) === $user->email;

            if (! $knowsThePassword || ! $namedThisAccount) {
                throw new InvalidCredentials;
            }

            PersonalAccessToken::query()
                ->where('tokenable_id', $user->id)
                ->where('tokenable_type', User::class)
                ->delete();

            $user->delete();
        });
    }
}
