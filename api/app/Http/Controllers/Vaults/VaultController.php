<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vaults;

use App\Application\Vaults\ListUserVaults;
use App\Http\Controllers\Controller;
use App\Http\Resources\VaultResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * El punto de entrada al contexto de tenant desde el cliente.
 *
 * No hay middleware de pertenencia aquí, y no es un olvido: esta ruta no lleva
 * vault en la URL porque es precisamente la que sirve para averiguarlo. El
 * aislamiento lo hace el propio servicio, que solo devuelve los vaults del usuario
 * que se le pasa.
 */
final class VaultController extends Controller
{
    public function index(Request $request, ListUserVaults $listUserVaults): JsonResponse
    {
        $vaults = $listUserVaults->handle($this->authenticatedUser($request)->id);

        return response()->json([
            'data' => ['vaults' => VaultResource::collection($vaults)],
        ]);
    }
}
