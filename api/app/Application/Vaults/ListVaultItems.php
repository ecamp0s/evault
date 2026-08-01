<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;
use Illuminate\Database\Eloquent\Collection;

/**
 * Los items de un vault, todos.
 *
 * Sin paginar y sin filtrar, y no por dejadez: el servidor no puede leer los
 * blobs, así que no puede ordenar por nombre ni buscar por contenido. El cliente
 * se sincroniza la vault entera y trabaja en memoria. Ver ADR-001.
 *
 * El orden es por fecha de creación para que la respuesta sea estable entre
 * llamadas; cualquier orden con sentido para el usuario tiene que calcularlo el
 * cliente cuando ya ha descifrado.
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
