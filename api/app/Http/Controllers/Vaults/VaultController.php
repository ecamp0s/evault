<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vaults;

use App\Application\Vaults\ListUserVaults;
use App\Http\Controllers\Controller;
use App\Http\Resources\VaultResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The entry point into the tenant context from the client.
 *
 * There is no membership middleware here, and it is no oversight: this route carries no
 * vault in the URL because it is precisely the one that tells you which there are. The
 * isolation is done by the service itself, which only returns the vaults of the user it
 * is handed.
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
