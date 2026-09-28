<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * Deleting an item from the bin, for good and before its thirty days are up.
 *
 * ADR-018 §2.4 names listing, restoring and the purge, and not this. It does not
 * contradict it: the bin exists so that a mistake can be undone, and whoever deletes a
 * leaked secret does not want it to stay a month on the server. The purge still runs
 * on its own; this only lets it happen sooner for one entry.
 *
 * It only reaches the bin. A live item gives VaultItemNotFound, so permanent deletion
 * always takes two deliberate steps, and a DELETE on an item that is repeated by a
 * retry can never turn into one.
 */
final readonly class PurgeVaultItem
{
    public function __construct(
        private VaultMembership $membership,
        private VaultItemLocator $locator,
    ) {}

    /**
     * @throws VaultNotAccessible
     * @throws VaultItemNotFound
     */
    public function handle(int $userId, string $vaultId, string $itemId): void
    {
        $this->membership->assert($userId, $vaultId);

        $this->locator->locateInTrash($vaultId, $itemId)->forceDelete();
    }
}
