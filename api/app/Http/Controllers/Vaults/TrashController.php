<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vaults;

use App\Application\Vaults\ListTrashedVaultItems;
use App\Application\Vaults\PurgeVaultItem;
use App\Application\Vaults\RestoreVaultItem;
use App\Http\Controllers\Controller;
use App\Http\Resources\TrashedVaultItemResource;
use App\Http\Resources\VaultItemResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The bin of ADR-018 §2.4: list it, take an item out, or delete one for good.
 *
 * Deleting into it is still DELETE /items/{item}, which keeps its contract. The bin is
 * a resource of its own and not a flag on the items so that nothing on the item
 * endpoints can reach a binned entry, nor anything here a live one.
 */
final class TrashController extends Controller
{
    public function index(Request $request, string $vault, ListTrashedVaultItems $listTrashedVaultItems): JsonResponse
    {
        $items = $listTrashedVaultItems->handle($this->authenticatedUser($request)->id, $vault);

        return response()->json([
            'data' => ['items' => TrashedVaultItemResource::collection($items)],
        ]);
    }

    public function restore(Request $request, string $vault, string $item, RestoreVaultItem $restoreVaultItem): JsonResponse
    {
        $restored = $restoreVaultItem->handle($this->authenticatedUser($request)->id, $vault, $item);

        return response()->json([
            'data' => ['item' => VaultItemResource::make($restored)],
        ]);
    }

    public function destroy(Request $request, string $vault, string $item, PurgeVaultItem $purgeVaultItem): Response
    {
        $purgeVaultItem->handle($this->authenticatedUser($request)->id, $vault, $item);

        return response()->noContent();
    }
}
