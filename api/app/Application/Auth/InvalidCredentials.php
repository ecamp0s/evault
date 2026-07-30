<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Credenciales que no identifican a ningún usuario.
 *
 * El mensaje es deliberadamente el mismo tanto si el correo no existe como si la
 * contraseña no coincide: distinguirlos permitiría enumerar qué correos están
 * registrados en el servicio.
 */
final class InvalidCredentials extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Las credenciales no son válidas.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 401);
    }
}
