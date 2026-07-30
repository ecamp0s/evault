<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forma pública de un usuario. Es parte del contrato de la API, así que añadir o
 * quitar campos aquí afecta a todos los clientes.
 *
 * Nunca debe exponer password ni remember_token. El modelo ya los marca como
 * ocultos, pero este recurso enumera los campos de forma explícita para que un
 * atributo nuevo no se filtre solo por haberse añadido a la tabla.
 *
 * @mixin User
 */
final class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
