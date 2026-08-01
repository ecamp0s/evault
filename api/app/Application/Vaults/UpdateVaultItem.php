<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Sustitución del contenido de un item.
 *
 * El payload se reemplaza entero aunque el método HTTP sea PATCH. No es una
 * licencia: texto cifrado, nonce y versión son un solo dato repartido en tres
 * columnas, y aceptar uno sin los otros dejaría una fila indescifrable. Lo
 * parcial, en este recurso, no significa nada.
 */
final readonly class UpdateVaultItem
{
    public function __construct(
        private VaultMembership $membership,
        private VaultItemLocator $locator,
    ) {}

    /**
     * @throws VaultNotAccessible
     * @throws VaultItemNotFound
     */
    public function handle(int $userId, string $vaultId, string $itemId, VaultItemPayload $payload): VaultItem
    {
        $this->membership->assert($userId, $vaultId);

        $item = $this->locator->locate($vaultId, $itemId);

        $item->update([
            'ciphertext' => $payload->ciphertext,
            'iv' => $payload->iv,
            'version' => $payload->version,
        ]);

        return $item;
    }
}
