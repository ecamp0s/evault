<?php

declare(strict_types=1);

/*
 * El origen que phpunit.xml declara como permitido.
 */
const ORIGEN_PERMITIDO = 'http://app.evault.claude';

it('responde a una ruta de /api con cabeceras CORS para el origen permitido', function (): void {
    $this->withHeader('Origin', ORIGEN_PERMITIDO)
        ->getJson('/api/health')
        ->assertOk()
        ->assertJson(['status' => 'ok'])
        ->assertHeader('Access-Control-Allow-Origin', ORIGEN_PERMITIDO);
});

it('responde al preflight con las cabeceras que el navegador necesita', function (): void {
    $respuesta = $this->call('OPTIONS', '/api/health', server: [
        'HTTP_ORIGIN' => ORIGEN_PERMITIDO,
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization,content-type',
    ]);

    expect($respuesta->getStatusCode())->toBe(204)
        ->and($respuesta->headers->get('Access-Control-Allow-Origin'))->toBe(ORIGEN_PERMITIDO)
        ->and($respuesta->headers->get('Access-Control-Allow-Methods'))->toContain('GET')
        ->and($respuesta->headers->get('Access-Control-Allow-Headers'))->toContain('authorization');
});

/*
 * Ojo con lo que se asserta aquí: la cabecera no desaparece ante un origen no
 * permitido. Cuando la lista tiene un único origen, php-cors la emite siempre con
 * ese valor fijo sin mirar el Origin de la petición, porque es cacheable y sigue
 * siendo seguro: quien compara Access-Control-Allow-Origin con su propio origen y
 * bloquea la respuesta es el navegador. Lo que hay que garantizar, por tanto, no
 * es que falte la cabecera, sino que nunca lleve el origen del atacante.
 */
it('no autoriza a un origen que no está en la lista', function (): void {
    $respuesta = $this->withHeader('Origin', 'http://atacante.test')
        ->getJson('/api/health');

    expect($respuesta->headers->get('Access-Control-Allow-Origin'))
        ->not->toBe('http://atacante.test')
        ->toBe(ORIGEN_PERMITIDO);
});

it('tampoco autoriza a un origen desconocido en el preflight', function (): void {
    $respuesta = $this->call('OPTIONS', '/api/health', server: [
        'HTTP_ORIGIN' => 'http://atacante.test',
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
    ]);

    expect($respuesta->headers->get('Access-Control-Allow-Origin'))
        ->not->toBe('http://atacante.test');
});

/*
 * En modo token el credencial viaja en la cabecera Authorization, no en cookies,
 * así que la API no debe pedir credenciales al navegador. Habilitarlo obligaría
 * además a no poder usar comodines y ampliaría la superficie sin ninguna ventaja.
 */
it('no admite credenciales por cookie', function (): void {
    expect(config('cors.supports_credentials'))->toBeFalse();
});

it('no expone las rutas web a CORS', function (): void {
    expect(config('cors.paths'))->toBe(['api/*']);
});
