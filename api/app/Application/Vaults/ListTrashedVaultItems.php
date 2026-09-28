<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;
use Illuminate\Database\Eloquent\Collection;

/**
 * What a vault has in the bin, most recently deleted first.
 *
 * Unpaginated for the same reason as ListVaultItems: the server cannot read the blobs,
 * so the client decrypts them all to show their names. The purge keeps the list short.
 */
final readonly class ListTrashedVaultItems
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
            ->onlyTrashed()
            ->where('vault_id', $vaultId)
            ->orderByDesc('deleted_at')
            ->orderBy('id')
            ->get();
    }
}
