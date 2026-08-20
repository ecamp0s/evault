<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Credentials that identify no user.
 *
 * The message is deliberately the same whether the email does not exist or the
 * password does not match: telling them apart would allow enumerating which emails are
 * registered in the service.
 */
final class InvalidCredentials extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Las credenciales no son válidas.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 401);
    }
}
