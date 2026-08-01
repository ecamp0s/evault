<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Alta de un item dentro de un vault.
 *
 * Segunda barrera del double guard: comprueba la pertenencia por su cuenta, sin
 * fiarse de que el middleware ya lo hiciera. Recibir un vault_id por parámetro no
 * es motivo para darlo por bueno.
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
         * Los campos se enumeran uno a uno en vez de esparcir un array del DTO:
         * así el análisis estático comprueba que cada clave existe de verdad en el
         * modelo, y una columna renombrada sale como error en vez de como un
         * atributo que se pierde en silencio.
         */
        return VaultItem::query()->create([
            'vault_id' => $vaultId,
            'ciphertext' => $payload->ciphertext,
            'iv' => $payload->iv,
            'version' => $payload->version,
        ]);
    }
}
