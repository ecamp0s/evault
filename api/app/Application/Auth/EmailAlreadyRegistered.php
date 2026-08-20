<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Second barrier of the double guard over the uniqueness of the email. The first is
 * the Form Request's unique rule; this one covers the gap between that check and the
 * insert, where two simultaneous requests can both pass validation.
 *
 * It renders in the same shape as a Laravel validation error, so that the client does
 * not have to tell which layer it came from.
 */
final class EmailAlreadyRegistered extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Los datos proporcionados no son válidos.');
    }

    public function render(Request $request): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'errors' => ['email' => ['Este correo ya está registrado.']],
        ], 422);
    }
}
