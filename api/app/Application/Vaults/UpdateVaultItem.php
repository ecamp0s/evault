<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Replacing an item's content.
 *
 * The payload is replaced whole even though the HTTP method is PATCH. It is not a
 * liberty: ciphertext, nonce and version are one datum spread across three columns,
 * and accepting one without the others would leave an undecryptable row. Partial, in
 * this resource, means nothing.
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
