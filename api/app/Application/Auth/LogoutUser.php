<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Revocación de un único token, el que se ha usado para hacer la petición. Los
 * demás tokens del usuario siguen vivos: cerrar sesión en un dispositivo no debe
 * cerrarla en los otros.
 */
final readonly class LogoutUser
{
    public function handle(int $userId, int $tokenId): void
    {
        /*
         * El filtro por propietario es la segunda barrera del double guard. El
         * controlador solo pasa el token de la petición autenticada, así que hoy
         * no puede llegar uno ajeno, pero de esta forma tampoco podría revocarse
         * si alguien llamara al servicio con un identificador de otro usuario.
         *
         * Es idempotente: si el token ya no existe no ocurre nada, y el endpoint
         * responde igual. Reintentar un logout nunca debe dar error.
         */
        PersonalAccessToken::query()
            ->whereKey($tokenId)
            ->where('tokenable_id', $userId)
            ->where('tokenable_type', User::class)
            ->delete();
    }
}
