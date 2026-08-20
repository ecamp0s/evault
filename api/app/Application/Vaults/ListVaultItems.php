<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;
use Illuminate\Database\Eloquent\Collection;

/**
 * A vault's items, all of them.
 *
 * Unpaginated and unfiltered, and not out of laziness: the server cannot read the
 * blobs, so it cannot sort by name or search by content. The client syncs the whole
 * vault and works in memory. See ADR-001.
 *
 * The order is by creation date so that the response is stable between calls; any
 * ordering that means something to the user has to be computed by the client once it
 * has decrypted.
 */
final readonly class ListVaultItems
{
    public function __construct(private VaultMembership $membership) {}

    /**
     * @return Collection<int, VaultItem>
     *
     * @throws VaultNotAccessible
     */
    public function handle(int $userId, string $vaultId): Collection
    {
        $this->membership->assert($userId, $vaultId);

        return VaultItem::query()
            ->where('vault_id', $vaultId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();
    }
}
