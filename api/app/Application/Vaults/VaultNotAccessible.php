<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * El vault no existe, o existe y el usuario no pertenece a él.
 *
 * Responde 404 y no 403 a propósito: un 403 confirmaría que el identificador
 * existe, y eso convierte la API en un oráculo con el que enumerar vaults ajenos.
 * Los dos casos tienen que ser indistinguibles desde fuera, y hay tests que lo
 * comprueban comparando ambas respuestas.
 */
final class VaultNotAccessible extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('El vault no existe o no es accesible.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 404);
    }
}
