<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Security headers for the API's responses.
 *
 * The API serves no HTML: it returns JSON and nothing else. That allows the strictest
 * policy there is, `default-src 'none'`, which there would be no way to apply to an
 * application with an interface. The SPA has its own, injected into its HTML at build
 * time; see web/src/lib/csp.ts.
 *
 * A JSON response carrying a CSP may look decorative and is not. A browser talked into
 * opening an API URL directly — from a link, say — renders the response, and if some
 * endpoint ever returned reflected content, that would be an XSS **on the API's
 * origin**, with that origin's cookies and permissions. Closing it costs one header.
 *
 * X-Content-Type-Options stops the browser from guessing the type and interpreting as
 * HTML a JSON that begins with something resembling it.
 *
 * X-Frame-Options on top of `frame-ancestors`: both do the same, but older browsers
 * understand the first one too, and declaring both costs nothing here. The SPA can use
 * neither, because its policy travels in a meta tag and `frame-ancestors` is ignored
 * there; it stands as a known asymmetry between the two origins, explained in
 * web/src/lib/csp.ts.
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
     * Puts the headers on a response that is already built.
     *
     * Public and static because it has to be called from two places, and that deserves
     * an explanation: an exception is turned into a response **outside** the middleware
     * pipeline, so a 401 from Sanctum or a 404 from a route that does not exist never
     * passes through handle() and would come out bare. Those are precisely the
     * responses somebody is most likely to end up opening directly in a browser.
     * bootstrap/app.php hooks it into the exception handler too, and there is a test
     * for each case.
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
         * No referrer. This API's URLs carry vault and item identifiers, which are
         * exactly the kind of metadata the rest of the design works to keep from
         * leaking. See docs/architecture/FOUNDATION.md.
         */
        $response->headers->set('Referrer-Policy', 'no-referrer');

        return $response;
    }
}
