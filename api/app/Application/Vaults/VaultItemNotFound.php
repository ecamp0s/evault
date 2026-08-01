<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * El item no existe dentro del vault de la ruta.
 *
 * Cubre dos casos que desde fuera son el mismo: que no exista en ninguna parte, y
 * que exista pero pertenezca a otro vault. Como todas las consultas van acotadas
 * por vault_id, el segundo caso es sencillamente invisible, que es la propiedad
 * que interesa.
 *
 * Que este mensaje se distinga del de VaultNotAccessible no filtra nada: para
 * llegar hasta aquí hay que haber demostrado ya pertenencia al vault de la ruta.
 */
final class VaultItemNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('El item no existe en este vault.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 404);
    }
}
