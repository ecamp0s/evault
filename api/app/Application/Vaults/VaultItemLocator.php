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
 */
final readonly class VaultItemLocator
{
    /**
     * @throws VaultItemNotFound
     */
    public function locate(string $vaultId, string $itemId): VaultItem
    {
        $item = VaultItem::query()
            ->whereKey($itemId)
            ->where('vault_id', $vaultId)
            ->first();

        if (! $item instanceof VaultItem) {
            throw new VaultItemNotFound;
        }

        return $item;
    }
}
