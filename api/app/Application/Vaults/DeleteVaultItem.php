<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * Permanent deletion of an item.
 *
 * There is no bin and no deferred deletion: the issue leaves them out on purpose. An
 * item that is no longer there returns a 404 and not a 204, because from the outside it
 * must not be told apart from one that never existed or belongs to somebody else.
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

        $this->locator->locate($vaultId, $itemId)->delete();
    }
}
