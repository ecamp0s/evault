<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Taking an item out of the bin.
 *
 * It comes back as the same entry: the same id, the same blob and the same dates. That
 * is what a client-side undo could not do —it would write a copy with another id— and
 * one of the reasons ADR-018 §2.4 put the bin on the server.
 */
final readonly class RestoreVaultItem
{
    public function __construct(
        private VaultMembership $membership,
        private VaultItemLocator $locator,
    ) {}

    /**
     * @throws VaultNotAccessible
     * @throws VaultItemNotFound
     */
    public function handle(int $userId, string $vaultId, string $itemId): VaultItem
    {
        $this->membership->assert($userId, $vaultId);

        $item = $this->locator->locateInTrash($vaultId, $itemId);

        VaultItem::withoutTimestamps(fn () => $item->restore());

        return $item;
    }
}
