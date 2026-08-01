<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Application\Vaults\VaultMembership;
use App\Application\Vaults\VaultNotAccessible;
use App\Models\User;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Primera barrera del double guard: nadie entra a un controlador de vault sin
 * pertenecer al vault de la ruta.
 *
 * La segunda está en cada servicio de aplicación, que vuelve a comprobarlo. Ver
 * ADR-004, que exige las dos y no una.
 *
 * Va aquí y no en el controlador para que no dependa de que alguien se acuerde de
 * llamarlo: cualquier ruta que se añada bajo este grupo queda cubierta.
 */
final readonly class EnsureVaultMembership
{
    public function __construct(private VaultMembership $membership) {}

    /**
     * @param  Closure(Request): Response  $next
     *
     * @throws AuthenticationException
     * @throws VaultNotAccessible
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        $vaultId = $request->route('vault');

        /*
         * Un parámetro que no sea una cadena no puede ser un identificador válido,
         * así que se trata igual que un vault inexistente. No se distingue el caso
         * porque desde fuera no debe distinguirse nada.
         */
        if (! is_string($vaultId)) {
            throw new VaultNotAccessible;
        }

        $this->membership->assert($user->id, $vaultId);

        return $next($request);
    }
}
