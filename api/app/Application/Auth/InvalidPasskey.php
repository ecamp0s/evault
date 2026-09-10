<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * The passkey does not open this account. See ADR-021.
 *
 * ONE ANSWER FOR THREE SITUATIONS: the email is not registered, it is registered and
 * has no passkey, or it has passkeys and none matches. Telling them apart would turn
 * this endpoint into an oracle that says which addresses exist AND which of them have
 * a passkey — the second being something the login does not leak and is not worth
 * starting to.
 *
 * The same shape as InvalidCredentials and InvalidRecoveryKey, and the tests compare
 * the responses against EACH OTHER rather than checking each on its own.
 */
final class InvalidPasskey extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No se ha podido desbloquear con ese passkey.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 401);
    }
}
