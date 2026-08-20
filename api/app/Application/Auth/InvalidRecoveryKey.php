<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * The recovery key does not open this account.
 *
 * It exists as an exception of its own and NOT as a variant of InvalidCredentials
 * because they are two different authentication paths, but outwards they produce the
 * same response. See ADR-010: telling a non-existent email apart from a wrong key
 * would turn this endpoint into an oracle for enumerating accounts, which is exactly
 * what ADR-008 avoided by discarding a prelogin endpoint.
 *
 * The message also covers a third case that cannot be told apart either: a user who
 * exists but never registered a recovery key. Knowing who has a second key and who
 * does not is something the login does not leak today, and that this endpoint is not
 * going to start leaking.
 */
final class InvalidRecoveryKey extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('La clave de recuperación no es válida.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 401);
    }
}
