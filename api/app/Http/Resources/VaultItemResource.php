<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\VaultItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forma pública de un item. Es parte del contrato de la API.
 *
 * Devuelve el blob tal y como se guardó, sin tocarlo. Los campos se enumeran de
 * forma explícita para que una columna nueva no se filtre sola por haberse
 * añadido a la tabla, que en esta tabla en concreto sería un fallo grave.
 *
 * @mixin VaultItem
 */
final class VaultItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'vault_id' => $this->vault_id,
            'ciphertext' => $this->ciphertext,
            'iv' => $this->iv,
            'version' => $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
