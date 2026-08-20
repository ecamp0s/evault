<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\Vault;

/**
 * The question «does this user belong to this vault?», in one place.
 *
 * Both barriers of the double guard ask it: the middleware before entering the
 * controller, and each application service on its own. That they share this class does
 * not weaken the guarantee, because what the double guard protects is that no layer
 * takes the other's work for granted; it does not demand writing the same query twice,
 * which would only multiply the chances of getting it wrong.
 *
 * What has to remain assertable is that calling a service directly, skipping the
 * controller entirely, is still safe. There is a test per service that checks it.
 */
final readonly class VaultMembership
{
    public function allows(int $userId, string $vaultId): bool
    {
        return Vault::query()
            ->whereKey($vaultId)
            ->whereHas('members', fn ($query) => $query->whereKey($userId))
            ->exists();
    }

    /**
     * @throws VaultNotAccessible
     */
    public function assert(int $userId, string $vaultId): void
    {
        if (! $this->allows($userId, $vaultId)) {
            throw new VaultNotAccessible;
        }
    }
}
