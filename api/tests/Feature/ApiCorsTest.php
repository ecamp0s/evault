<?php

declare(strict_types=1);

/*
 * Que la API NO emita cabeceras CORS, que es lo contrario de lo que este fichero
 * comprobaba hasta el issue #296.
 *
 * Desde ADR-016 la SPA y la API comparten origen, así que no hay cruce que permitir
 * y la configuración de CORS se retiró entera: `config/cors.php`, `CorsOrigins` y el
 * guard de arranque de `AppServiceProvider`.
 *
 * ESTE FICHERO NO SE BORRÓ CON ELLA A PROPÓSITO. Retirar una defensa y quedarse sin
 * ninguna comprobación deja el hueco abierto para que vuelva de la peor forma: quien
 * en el futuro tropiece con un error de origen cruzado tiene delante un remedio de
 * una línea —`allowed_origins => ['*']`— que funciona a la primera y abre la API a
 * cualquier página del navegador de la víctima. Lo que se vigila aquí es que eso no
 * pase inadvertido.
 */

it('no autoriza a ningún origen, porque ya no hay orígenes cruzados que permitir', function (): void {
    $response = $this->withHeader('Origin', 'http://atacante.test')
        ->getJson('/api/health');

    $response->assertOk();

    expect($response->headers->get('Access-Control-Allow-Origin'))->toBeNull()
        ->and($response->headers->get('Access-Control-Allow-Credentials'))->toBeNull();
});

it('tampoco responde a un preflight, que es la otra mitad del mecanismo', function (): void {
    $response = $this->call('OPTIONS', '/api/health', server: [
        'HTTP_ORIGIN' => 'http://atacante.test',
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization,content-type',
    ]);

    expect($response->headers->get('Access-Control-Allow-Origin'))->toBeNull()
        ->and($response->headers->get('Access-Control-Allow-Methods'))->toBeNull();
});

/*
 * La API sigue siendo alcanzable por la SPA, que es lo que no puede romperse al
 * retirar CORS: comparten origen, así que el navegador no pide permiso ninguno.
 */
it('responde con normalidad a una petición del mismo origen', function (): void {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJson(['status' => 'ok']);
});
