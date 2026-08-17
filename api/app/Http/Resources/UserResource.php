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
            /*
             * SI HAY CLAVE DE RECUPERACIÓN, no cuál: un booleano derivado de que la
             * columna esté puesta. El hash no sale de aquí ni saldría nunca.
             *
             * Existe porque el cliente lo necesita para hacer lo correcto al cambiar
             * el correo, y no puede deducirlo: cambiarlo INVALIDA la clave de
             * recuperación —el correo es el salt de su derivación— así que quien
             * tenga una debe recibir otra dentro de la misma operación. Y a quien no
             * la tenga no hay que inventarle una obligación que nunca tuvo, que es lo
             * que ADR-010 dejó como estado legítimo y permanente.
             *
             * Sin este campo, la pantalla solo puede elegir entre molestar a unos o
             * dejar a otros con una llave que ya no abre. Ver ADR-014 §2.1 y #222.
             *
             * No filtra nada: /auth/me devuelve al usuario autenticado sus propios
             * datos, y que uno sepa si tiene clave de recuperación es lo mínimo.
             */
            'has_recovery_key' => $this->recovery_auth_hash !== null,
        ];
    }
}
