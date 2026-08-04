<?php

declare(strict_types=1);

use App\Models\User;

/*
 * La API no sirve HTML, así que puede permitirse la política más estricta que
 * existe. Lo que estos tests vigilan es que siga siendo así y que las cabeceras
 * lleguen a todas las respuestas, también a las que nadie mira: los errores y los
 * 404 salen igual del navegador.
 */

it('sirve una CSP que no permite nada', function (): void {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertHeader(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );
});

it('impide que el navegador adivine el tipo de contenido', function (): void {
    $this->getJson('/api/health')->assertHeader('X-Content-Type-Options', 'nosniff');
});

it('impide que la API se cargue dentro de un frame', function (): void {
    $this->getJson('/api/health')->assertHeader('X-Frame-Options', 'DENY');
});

/*
 * Las URLs de esta API llevan identificadores de vault y de item, que son la misma
 * clase de metadato que el resto del diseño se esfuerza en no filtrar. Ver
 * docs/architecture/FOUNDATION.md.
 */
it('no filtra la URL de origen al navegar fuera', function (): void {
    $this->getJson('/api/health')->assertHeader('Referrer-Policy', 'no-referrer');
});

/*
 * Una respuesta de error es la que más probablemente acabe abierta directamente en
 * un navegador, así que es donde más importa que las cabeceras no falten.
 */
it('las envía también en las respuestas de error', function (string $ruta, int $estado): void {
    $this->getJson($ruta)
        ->assertStatus($estado)
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'DENY');
})->with([
    'sin autenticar' => ['/api/vaults', 401],
    'ruta inexistente' => ['/api/no-existe', 404],
]);

it('las envía en las respuestas autenticadas', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $token = $user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff');
});

/*
 * La CSP no puede romper el CORS: son mecanismos distintos y la SPA vive en otro
 * origen. Si esto fallara, la aplicación entera dejaría de poder hablar con su API.
 */
it('no interfiere con las cabeceras de CORS', function (): void {
    $response = $this->withHeaders(['Origin' => 'http://app.evault.localhost'])
        ->getJson('/api/health');

    $response->assertOk()
        ->assertHeader('Access-Control-Allow-Origin', 'http://app.evault.localhost')
        ->assertHeader('X-Content-Type-Options', 'nosniff');
});
