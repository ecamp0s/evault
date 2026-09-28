<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Looks an item up **inside one specific vault**.
 *
 * It exists so that the scope by vault_id is written once. It is the query that cannot
 * go wrong: one that looked the item up by its identifier alone would return other
 * users' items, which is the worst possible failure in this product and the risk
 * ADR-004 names explicitly. Repeating it in the three services that need it would be
 * handing out three chances to forget the where.
 *
 * It has two doors, one per side of the bin, and neither sees the other side: locate()
 * finds live items and locateInTrash() binned ones. An item in the bin cannot be read,
 * edited or deleted again through the item endpoints, and a live one cannot be
 * restored or purged. See ADR-018 §2.4.
 */
final readonly class VaultItemLocator
{
    /**
     * @throws VaultItemNotFound
     */
    public function locate(string $vaultId, string $itemId): VaultItem
    {
        $item = VaultItem::query()
            ->withoutTrashed()
            ->whereKey($itemId)
            ->where('vault_id', $vaultId)
            ->first();

        if (! $item instanceof VaultItem) {
            throw new VaultItemNotFound;
        }

        return $item;
    }

    /**
     * @throws VaultItemNotFound
     */
    public function locateInTrash(string $vaultId, string $itemId): VaultItem
    {
        $item = VaultItem::query()
            ->onlyTrashed()
            ->whereKey($itemId)
            ->where('vault_id', $vaultId)
            ->first();

        if (! $item instanceof VaultItem) {
            throw new VaultItemNotFound;
        }

        return $item;
    }
}
