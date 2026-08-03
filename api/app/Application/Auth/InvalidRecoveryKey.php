<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * La clave de recuperación no abre esta cuenta.
 *
 * Existe como excepción propia y NO como una variante de InvalidCredentials porque
 * son dos caminos de autenticación distintos, pero hacia fuera producen la misma
 * respuesta. Ver ADR-010: distinguir el correo inexistente de la clave incorrecta
 * convertiría este endpoint en un oráculo de enumeración de cuentas, que es justo
 * lo que ADR-008 evitó al descartar un endpoint de prelogin.
 *
 * El mensaje cubre además un tercer caso que tampoco puede distinguirse: el de un
 * usuario que existe pero nunca registró una clave de recuperación. Saber quién
 * tiene segunda llave y quién no es un dato que el login no filtra hoy, y que este
 * endpoint no va a estrenar.
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
