<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Application\Vaults\VaultSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forma pública de un vault. Es parte del contrato de la API.
 *
 * Envuelve un VaultSummary y no el modelo, porque el rol que se expone aquí no
 * vive en la tabla de vaults sino en la de pertenencia.
 *
 * @mixin VaultSummary
 */
final class VaultResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            // Booleano derivado: en la base de datos ser personal es una relación,
            // no una columna. Ver docs/architecture/FOUNDATION.md.
            'is_personal' => $this->isPersonal,
            'role' => $this->role->value,
        ];
    }
}
