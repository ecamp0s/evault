<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Vault;
use App\Models\VaultItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VaultItem>
 */
class VaultItemFactory extends Factory
{
    /** @var class-string<VaultItem> */
    protected $model = VaultItem::class;

    public function definition(): array
    {
        return [
            'vault_id' => Vault::factory(),

            /*
             * Bytes aleatorios en base64. No representan nada y no hace falta que
             * lo hagan: para el servidor, un item real tampoco significa nada.
             * Generar aquí algo con estructura solo serviría para tentar a alguien
             * a escribir código que la mire.
             */
            'ciphertext' => base64_encode(random_bytes(256)),
            'iv' => base64_encode(random_bytes(12)),

            // La versión la decide el cliente; 1 es la codificación temporal de la
            // Iteración 2. El registro de versiones está en
            // docs/architecture/FOUNDATION.md.
            'version' => 1,
        ];
    }
}
