<?php

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Laravel\Sanctum\Http\Middleware\CheckAbilities;
use Laravel\Sanctum\Http\Middleware\CheckForAnyAbility;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * A guest is never redirected: they get a 401. By default the Authenticate
         * middleware resolves route('login') to redirect them, and that route does
         * not exist in an API, so the RouteNotFoundException is thrown inside the
         * middleware itself and turns the 401 into a 500. It happens before the
         * exception handler can decide the format, so shouldRenderJsonWhen on its own
         * does not prevent it.
         *
         * It is null across the whole project and not only under api/*, because today
         * there is no session route to redirect to.
         */
        $middleware->redirectGuestsTo(fn (Request $request): ?string => null);

        /*
         * CORS out: since ADR-016 the SPA and the API share an origin, so there is no
         * crossing to allow and the mechanism has no work to do.
         *
         * IT IS THE MIDDLEWARE THAT GOES, and deleting `config/cors.php` is not
         * enough. That was the first thing tried when closing issue #296 and it does
         * the exact opposite of what it looks like: with no configuration file,
         * Laravel applies the package defaults, which carry `allowed_origins =>
         * ['*']`. The API started answering `Access-Control-Allow-Origin: *` to any
         * origin — that is, removing the configuration threw it wide open instead of
         * shutting it. The test in tests/Feature/ApiCorsTest.php caught it, which is
         * exactly what it exists for.
         */
        $middleware->remove(HandleCors::class);

        /*
         * Security headers on every API response, error responses and 404s included,
         * which also come out of the browser. Added to the whole group and not route
         * by route so that a new endpoint inherits them without anybody having to
         * remember, as was done with EnsureVaultMembership.
         */
        $middleware->api(append: [SecurityHeaders::class]);

        /*
         * Sanctum ships these middleware but does NOT register their aliases on its
         * own, so using them on a route without this fails with «Target class
         * [abilities] does not exist», which looks nothing like what is going on.
         *
         * They are needed since ADR-010: the authenticated routes demand `abilities:*`
         * so that the recovery token, which carries only `recovery:complete`, is no
         * use for opening the vault.
         */
        $middleware->alias([
            'abilities' => CheckAbilities::class,
            'ability' => CheckForAnyAbility::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /*
         * Everything hanging off /api answers in JSON, errors included, even when the
         * client does not send Accept: application/json. Without this, a request with
         * no token to a protected route does not give a 401: the authentication
         * middleware tries to redirect to the 'login' route, which does not exist in
         * an API, and the result is a 500. The error contract has to be stable from
         * now on, because Iteration 3 reuses it.
         */
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * And the security headers on error responses too.
         *
         * An exception is turned into a response outside the middleware pipeline, so a
         * 401 from Sanctum or a 404 from a route that does not exist never passes
         * through SecurityHeaders and would come out bare. Those are precisely the
         * responses somebody is most likely to end up opening directly in a browser,
         * so they are where the headers can least afford to be missing.
         */
        $exceptions->respond(fn (Response $response): Response => SecurityHeaders::apply($response));
    })->create();
