<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabeceras de seguridad para las respuestas de la API.
 *
 * La API no sirve HTML: devuelve JSON y nada más. Eso permite la política más
 * estricta que existe, `default-src 'none'`, que no habría forma de aplicar a una
 * aplicación con interfaz. La SPA tiene la suya aparte, inyectada en su HTML
 * durante el build; ver web/src/lib/csp.ts.
 *
 * Que una respuesta JSON lleve CSP puede parecer decorativo y no lo es. Un
 * navegador al que se le convenza de abrir directamente una URL de la API —por
 * ejemplo desde un enlace— renderiza la respuesta, y si algún día un endpoint
 * devolviera contenido reflejado, eso sería un XSS **en el origen de la API**, con
 * las cookies y los permisos de ese origen. Cerrarlo cuesta una cabecera.
 *
 * X-Content-Type-Options impide que el navegador adivine el tipo e interprete como
 * HTML un JSON que empiece por algo que se le parezca.
 *
 * X-Frame-Options además de `frame-ancestors`: las dos hacen lo mismo, pero la
 * primera la entienden también los navegadores más viejos, y aquí no cuesta nada
 * declarar las dos. La SPA no puede usar ninguna de ellas, porque su política viaja
 * en un meta y ahí `frame-ancestors` se ignora; queda como una asimetría conocida
 * entre los dos orígenes, explicada en web/src/lib/csp.ts.
 */
final class SecurityHeaders
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        return self::apply($next($request));
    }

    /**
     * Pone las cabeceras en una respuesta ya construida.
     *
     * Es público y estático porque hace falta llamarlo desde dos sitios, y eso
     * merece explicación: una excepción se convierte en respuesta **fuera** del
     * pipeline de middleware, así que un 401 de Sanctum o un 404 de ruta
     * inexistente no pasan por handle() y saldrían sin cabeceras. Son justamente
     * las respuestas que más probablemente acabe abriendo alguien directamente en
     * un navegador. bootstrap/app.php lo engancha también al manejador de
     * excepciones, y hay un test por cada caso.
     */
    public static function apply(Response $response): Response
    {
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');

        /*
         * Sin referrer. Las URLs de esta API llevan identificadores de vault y de
         * item, que son justo la clase de metadato que el resto del diseño se
         * esfuerza en no filtrar. Ver docs/architecture/FOUNDATION.md.
         */
        $response->headers->set('Referrer-Policy', 'no-referrer');

        return $response;
    }
}
