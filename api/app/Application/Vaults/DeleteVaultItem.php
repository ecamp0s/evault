<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * Borrado definitivo de un item.
 *
 * No hay papelera ni borrado diferido: el issue los deja fuera a propósito. Un
 * item que ya no está devuelve 404 y no un 204, porque desde fuera no debe
 * distinguirse de uno que nunca existió o que es de otro.
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
