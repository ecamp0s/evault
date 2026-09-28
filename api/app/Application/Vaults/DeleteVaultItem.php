<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Deleting an item puts it in the bin, where it stays thirty days (ADR-018 §2.4).
 *
 * An item that is no longer there returns a 404 and not a 204, because from the outside
 * it must not be told apart from one that never existed or belongs to somebody else —
 * and an item already in the bin counts as no longer there. That is also what makes a
 * repeated DELETE harmless: a retry after a lost response finds nothing, and never
 * reaches the permanent deletion, which has its own endpoint (PurgeVaultItem).
 *
 * updated_at is left alone. It is what the client sorts «recently modified» by, and
 * deleting and restoring an entry has not modified it; a restore has to bring back the
 * entry exactly as it was.
 */
final readonly class DeleteVaultItem
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

        $item = $this->locator->locate($vaultId, $itemId);

        VaultItem::withoutTimestamps(fn () => $item->delete());
    }
}
