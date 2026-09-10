<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * That credential is already registered. See ADR-021.
 *
 * It happens for real and it is not an attack: somebody adds the same device twice,
 * because from the outside a passkey that already works looks exactly like one that was
 * never added.
 *
 * THE MESSAGE DOES NOT SAY WHOSE IT IS, and that is deliberate. The credential could
 * belong to the account asking or to another one, and telling those apart would say
 * that a given credential exists somewhere in the instance. That leak is not
 * exploitable — a credential id is sixteen random bytes and cannot be guessed, and
 * reaching this line takes a valid session — but the two cases cost nothing to answer
 * identically, and an oracle that costs nothing to close gets closed.
 *
 * 409 and not 422: nothing about the request is malformed. The state of the server is
 * what makes it impossible.
 */
final class PasskeyAlreadyRegistered extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Ese passkey ya está registrado.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
