<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vaults;

use App\Application\Vaults\CreateVaultItem;
use App\Application\Vaults\DeleteVaultItem;
use App\Application\Vaults\ListVaultItems;
use App\Application\Vaults\ShowVaultItem;
use App\Application\Vaults\UpdateVaultItem;
use App\Http\Controllers\Controller;
use App\Http\Requests\Vaults\VaultItemRequest;
use App\Http\Resources\VaultItemResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Los cinco endpoints de items. Aquí no hay lógica: se traduce la petición a una
 * llamada al servicio de aplicación y el resultado a JSON.
 *
 * El vault llega por la ruta y no por sesión, porque la API es stateless y el
 * contexto de tenant viaja explícito en cada llamada. Ver ADR-004.
 */
final class VaultItemController extends Controller
{
    public function index(Request $request, string $vault, ListVaultItems $listVaultItems): JsonResponse
    {
        $items = $listVaultItems->handle($this->authenticatedUser($request)->id, $vault);

        return response()->json([
            'data' => ['items' => VaultItemResource::collection($items)],
        ]);
    }

    public function store(VaultItemRequest $request, string $vault, CreateVaultItem $createVaultItem): JsonResponse
    {
        $item = $createVaultItem->handle(
            userId: $this->authenticatedUser($request)->id,
            vaultId: $vault,
            payload: $request->payload(),
        );

        return response()->json([
            'data' => ['item' => VaultItemResource::make($item)],
        ], 201);
    }

    public function show(Request $request, string $vault, string $item, ShowVaultItem $showVaultItem): JsonResponse
    {
        $found = $showVaultItem->handle($this->authenticatedUser($request)->id, $vault, $item);

        return response()->json([
            'data' => ['item' => VaultItemResource::make($found)],
        ]);
    }

    public function update(VaultItemRequest $request, string $vault, string $item, UpdateVaultItem $updateVaultItem): JsonResponse
    {
        $updated = $updateVaultItem->handle(
            userId: $this->authenticatedUser($request)->id,
            vaultId: $vault,
            itemId: $item,
            payload: $request->payload(),
        );

        return response()->json([
            'data' => ['item' => VaultItemResource::make($updated)],
        ]);
    }

    public function destroy(Request $request, string $vault, string $item, DeleteVaultItem $deleteVaultItem): Response
    {
        $deleteVaultItem->handle($this->authenticatedUser($request)->id, $vault, $item);

        return response()->noContent();
    }
}
