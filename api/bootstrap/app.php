<?php

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
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
         * Un invitado nunca se redirige: se le responde 401. Por defecto el
         * middleware Authenticate resuelve route('login') para redirigirlo, y esa
         * ruta no existe en una API, así que la RouteNotFoundException se lanza
         * dentro del propio middleware y convierte el 401 en un 500. Ocurre antes
         * de que el manejador de excepciones pueda decidir el formato, por lo que
         * shouldRenderJsonWhen por sí solo no lo evita.
         *
         * Es null en todo el proyecto y no solo bajo api/*, porque hoy no hay
         * ninguna ruta con sesión a la que redirigir. El futuro panel Filament no
         * se ve afectado: resuelve su propia autenticación y su propio login.
         */
        $middleware->redirectGuestsTo(fn (Request $request): ?string => null);

        /*
         * Cabeceras de seguridad en todas las respuestas de la API, incluidas las
         * de error y las de un 404, que también salen del navegador. Se añade al
         * grupo entero y no ruta a ruta para que un endpoint nuevo las herede sin
         * que nadie tenga que acordarse, igual que se hizo con
         * EnsureVaultMembership.
         */
        $middleware->api(append: [SecurityHeaders::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /*
         * Todo lo que cuelga de /api responde en JSON, también los errores, aunque
         * el cliente no envíe Accept: application/json. Sin esto, una petición sin
         * token a una ruta protegida no da 401: el middleware de autenticación
         * intenta redirigir a la ruta 'login', que en una API no existe, y el
         * resultado es un 500. El contrato de error tiene que ser estable desde
         * ahora, porque la Iteración 3 lo reutiliza.
         */
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * Y las cabeceras de seguridad también en las respuestas de error.
         *
         * Una excepción se convierte en respuesta fuera del pipeline de middleware,
         * así que un 401 de Sanctum o un 404 de ruta inexistente no pasan por
         * SecurityHeaders y saldrían sin cabeceras. Son justo las respuestas que
         * más fácilmente acaba abriendo alguien directamente en el navegador, así
         * que es donde menos conviene que falten.
         */
        $exceptions->respond(fn (Response $response): Response => SecurityHeaders::aplicar($response));
    })->create();
