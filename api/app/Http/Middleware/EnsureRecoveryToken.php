<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Application\Auth\AccessTokens;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Deja pasar SOLO al token de un solo uso de la recuperación. Ver ADR-010.
 *
 * Existe porque el middleware `ability` de Sanctum no sirve para esto, y el motivo
 * es contraintuitivo: un token de sesión normal se emite con la capacidad `*`, y `*`
 * satisface CUALQUIER comprobación de capacidad. Es decir, `ability:recovery:complete`
 * deja pasar tanto al token de recuperación como a todos los demás.
 *
 * Con eso, cualquier token de sesión habría podido fijar una contraseña maestra
 * nueva SIN CONOCER LA ACTUAL, saltándose la verificación que hace /master-password.
 * Un token robado habría bastado para expulsar al dueño de su propia vault, que es
 * justo lo que aquel endpoint se molesta en impedir. Lo detectó el test que
 * comprobaba que una sesión normal no entra aquí.
 *
 * Por eso se compara la lista exacta de capacidades en vez de preguntar si tiene
 * una: lo que se quiere no es «puede esto», sino «no puede nada más».
 */
final class EnsureRecoveryToken
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->user()?->currentAccessToken();

        if (! $token instanceof PersonalAccessToken
            || $token->abilities !== [AccessTokens::RECOVERY_ABILITY]) {
            abort(403, 'Este token no sirve para terminar una recuperación.');
        }

        return $next($request);
    }
}
