<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * The session does not exist among the account's, which covers somebody else's: the
 * two answer the same, as everywhere in this API. See ADR-004.
 */
final class SessionNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('La sesión no existe o no es accesible.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 404);
    }
}
