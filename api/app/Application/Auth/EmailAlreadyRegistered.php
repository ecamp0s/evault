<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Segunda barrera del double guard sobre la unicidad del correo. La primera es la
 * regla unique del Form Request; esta cubre el hueco entre esa comprobación y el
 * insert, donde dos peticiones simultáneas pueden pasar ambas la validación.
 *
 * Se renderiza con la misma forma que un error de validación de Laravel, para que
 * el cliente no tenga que distinguir de qué capa vino.
 */
final class EmailAlreadyRegistered extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Los datos proporcionados no son válidos.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'errors' => ['email' => ['Este correo ya está registrado.']],
        ], 422);
    }
}
