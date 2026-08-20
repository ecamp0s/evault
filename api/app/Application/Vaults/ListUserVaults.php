<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Support\Collection;

/**
 * The vaults a user belongs to.
 *
 * It is the entry point into the tenant context from the client: if the vault travels
 * explicitly on every call, somebody has to tell the client which vaults it has.
 *
 * It was not solved by folding it into /api/auth/me, which would have been cheaper
 * while every user has exactly one, for two reasons: it would change the contract of
 * an endpoint that was decided to stay stable until Iteration 3, and it would stop
 * serving as soon as shared vaults exist.
 *
 * When organisations arrive, this endpoint will return their vaults too without
 * changing shape.
 */
final readonly class ListUserVaults
{
    /**
     * @return Collection<int, VaultSummary>
     */
    public function handle(int $userId): Collection
    {
        $user = User::query()->whereKey($userId)->first();

        if (! $user instanceof User) {
            /*
             * A user who does not exist belongs to nothing. Returning an empty list and
             * not throwing is right here: the caller already arrives authenticated, so
             * this case is not a client error but a situation that should not arise,
             * and blowing it up would only trade an empty 200 for a 500.
             */
            return new Collection;
        }

        return $user->vaults()
            ->orderBy('name')
            ->orderBy('id')
            ->get()
            ->map(fn (Vault $vault): VaultSummary => new VaultSummary(
                id: $vault->id,
                name: $vault->name,
                /*
                 * Personal to *this* user, not personal in the abstract. Today it makes
                 * no difference, because nobody ever belongs to somebody else's
                 * personal vault, but writing it this way keeps the response from
                 * meaning something different the day shared vaults exist.
                 */
                isPersonal: $vault->personal_for_user_id === $userId,
                role: $vault->pivot->role,
                /*
                 * From the pivot and not from the vault: the wrapped key is this user's.
                 * Since the query starts from $user->vaults(), the pivot that arrives is
                 * always theirs, so there is no way to return somebody else's without
                 * changing where this query starts.
                 */
                wrappedKey: new WrappedVaultKey(
                    ciphertext: $vault->pivot->wrapped_key,
                    iv: $vault->pivot->wrapped_key_iv,
                ),
            ))
            ->values();
    }
}
