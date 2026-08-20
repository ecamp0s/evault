<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * The item does not exist inside the route's vault.
 *
 * It covers two cases that from the outside are the same: that it does not exist
 * anywhere, and that it exists but belongs to another vault. Since every query is
 * scoped by vault_id, the second case is simply invisible, which is the property that
 * matters.
 *
 * That this message differs from VaultNotAccessible's leaks nothing: getting here takes
 * having already proven membership of the route's vault.
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
