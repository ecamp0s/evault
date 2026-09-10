<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * The passkey does not exist, or it exists and belongs to somebody else.
 *
 * 404 and never 403, like VaultNotAccessible and for the same reason: a 403 would
 * confirm the identifier exists, which turns the endpoint into an oracle for
 * enumerating other people's passkeys. The two cases have to be indistinguishable from
 * outside, and there is a test that checks it by comparing the two responses against
 * each other rather than each on its own.
 */
final class PasskeyNotFound extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('El passkey no existe o no es accesible.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 404);
    }
}
