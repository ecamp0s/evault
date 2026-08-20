<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * The vault does not exist, or it exists and the user does not belong to it.
 *
 * It answers 404 and not 403 on purpose: a 403 would confirm the identifier exists,
 * and that turns the API into an oracle for enumerating other people's vaults. Both
 * cases have to be indistinguishable from the outside, and there are tests that check
 * it by comparing the two responses.
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
