<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;

/**
 * Busca un item **dentro de un vault concreto**.
 *
 * Existe para que el acotado por vault_id se escriba una sola vez. Es la
 * consulta que no puede salir mal: una que buscara el item solo por su
 * identificador devolvería items de otros usuarios, que es el peor fallo posible
 * en este producto y el riesgo que ADR-004 nombra de forma explícita. Repetirla en
 * los tres servicios que la necesitan sería dar tres oportunidades de olvidarse
 * del where.
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
