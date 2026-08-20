<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Creating an item inside a vault.
 *
 * Second barrier of the double guard: it checks membership on its own, without
 * trusting that the middleware already did. Receiving a vault_id as a parameter is no
 * reason to take it as good.
 */
final readonly class CreateVaultItem
{
    public function __construct(private VaultMembership $membership) {}

    /**
     * @throws VaultNotAccessible
     */
    public function handle(int $userId, string $vaultId, VaultItemPayload $payload): VaultItem
    {
        $this->membership->assert($userId, $vaultId);

        /*
         * The fields are enumerated one by one instead of spreading an array from the
         * DTO: that way static analysis checks that each key really exists on the
         * model, and a renamed column comes out as an error instead of as an attribute
         * lost in silence.
         */
        return VaultItem::query()->create([
            'vault_id' => $vaultId,
            'ciphertext' => $payload->ciphertext,
            'iv' => $payload->iv,
            'version' => $payload->version,
        ]);
    }
}
