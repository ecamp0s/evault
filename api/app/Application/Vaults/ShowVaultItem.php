<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Un item concreto de un vault.
 */
final readonly class ShowVaultItem
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

        return $this->locator->locate($vaultId, $itemId);
    }
}
