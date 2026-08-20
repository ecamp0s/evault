<?php

declare(strict_types=1);

/*
 * That the API emits NO CORS headers, which is the opposite of what this file checked
 * until issue #296.
 *
 * Since ADR-016 the SPA and the API share an origin, so there is no crossing to allow
 * and the CORS configuration was removed entirely: `config/cors.php`, `CorsOrigins` and
 * the startup guard in `AppServiceProvider`.
 *
 * THIS FILE WAS NOT DELETED WITH IT, ON PURPOSE. Removing a defence and being left with
 * no check at all leaves the hole open for it to come back in the worst way: whoever
 * trips over a cross-origin error in the future has a one-line remedy in front of them
 * — `allowed_origins => ['*']` — that works first time and opens the API to any page in
 * the victim's browser. What is watched here is that this does not go unnoticed.
 */

it('authorises no origin, because there are no cross-origins left to allow', function (): void {
    $response = $this->withHeader('Origin', 'http://atacante.test')
        ->getJson('/api/health');

    $response->assertOk();

    expect($response->headers->get('Access-Control-Allow-Origin'))->toBeNull()
        ->and($response->headers->get('Access-Control-Allow-Credentials'))->toBeNull();
});

it('does not answer a preflight either, which is the other half of the mechanism', function (): void {
    $response = $this->call('OPTIONS', '/api/health', server: [
        'HTTP_ORIGIN' => 'http://atacante.test',
        'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization,content-type',
    ]);

    expect($response->headers->get('Access-Control-Allow-Origin'))->toBeNull()
        ->and($response->headers->get('Access-Control-Allow-Methods'))->toBeNull();
});

/*
 * The API is still reachable by the SPA, which is what cannot break when CORS is
 * removed: they share an origin, so the browser asks for no permission at all.
 */
it('answers a same-origin request normally', function (): void {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJson(['status' => 'ok']);
});
