{{--
    What the API's root answers, which is nothing an application would.

    IT USED TO BE LARAVEL'S STOCK WELCOME PAGE (#344): 225 lines, 65 KB of Tailwind
    inlined as a fallback, and a request out to a font CDN — inside a directory that is
    a JSON API and has no frontend by ADR-002 and ADR-003. It only said «eVault» because
    APP_NAME feeds its title.

    In a public repository whose second purpose is that somebody reads it judging
    technical criteria (ADR-009 §1), that page said there is a frontend here. There is
    not: the interface is the SPA in web/, served separately.

    It stays as a page rather than becoming a 404 because something has to answer at the
    root, and a person who lands here deserves to be told what they found.
--}}
<!DOCTYPE html>
<html lang="es">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{ config('app.name', 'eVault') }} — API</title>
        <style>
            body {
                margin: 0;
                min-height: 100svh;
                display: grid;
                place-items: center;
                padding: 2rem;
                background: #0a0a0a;
                color: #e5e5e5;
                font: 1rem/1.6 ui-sans-serif, system-ui, sans-serif;
            }
            main { max-width: 34rem; }
            h1 { font-size: 1.25rem; margin: 0 0 1rem; }
            p { margin: 0 0 1rem; color: #a3a3a3; }
            code { color: #e5e5e5; }
            a { color: #e5e5e5; }
        </style>
    </head>
    <body>
        <main>
            <h1>{{ config('app.name', 'eVault') }} — API</h1>
            <p>
                Esto es la API de eVault, y solo responde JSON bajo <code>/api</code>.
                Aquí no hay interfaz: la aplicación es una SPA que se sirve aparte.
            </p>
            <p>
                El servidor no puede leer lo que guardas. Las contraseñas se cifran en tu
                dispositivo antes de salir de él, y lo que se almacena son bytes opacos.
            </p>
            <p>
                <a href="https://github.com/ecamp0s/evault">github.com/ecamp0s/evault</a>
            </p>
        </main>
    </body>
</html>
