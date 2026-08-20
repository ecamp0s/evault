<?php

declare(strict_types=1);

use App\Models\User;

/*
 * The API serves no HTML, so it can afford the strictest policy there is. What these
 * tests watch is that it stays that way and that the headers reach every response,
 * including the ones nobody looks at: errors and 404s come out of the browser just the
 * same.
 */

it('serves a CSP that permits nothing', function (): void {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertHeader(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );
});

it('stops the browser from guessing the content type', function (): void {
    $this->getJson('/api/health')->assertHeader('X-Content-Type-Options', 'nosniff');
});

it('stops the API from being loaded inside a frame', function (): void {
    $this->getJson('/api/health')->assertHeader('X-Frame-Options', 'DENY');
});

/*
 * This API's URLs carry vault and item identifiers, which are the same class of
 * metadata the rest of the design works to keep from leaking. See
 * docs/architecture/FOUNDATION.md.
 */
it('does not leak the originating URL when navigating away', function (): void {
    $this->getJson('/api/health')->assertHeader('Referrer-Policy', 'no-referrer');
});

/*
 * An error response is the one most likely to end up opened directly in a browser, so
 * it is where the headers matter most.
 */
it('sends them on error responses too', function (string $path, int $status): void {
    $this->getJson($path)
        ->assertStatus($status)
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'DENY');
})->with([
    'sin autenticar' => ['/api/vaults', 401],
    'ruta inexistente' => ['/api/no-existe', 404],
]);

it('sends them on authenticated responses', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $token = $user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff');
});

/*
 * The security headers are emitted wherever the request comes from, including when it
 * carries an `Origin`. Until issue #296 this case also checked that the CSP did not
 * break CORS; there is no CORS left to break, because since ADR-016 the SPA and the API
 * share an origin. What remains to watch is that an `Origin` in the request does not
 * alter the response, neither by adding permissions nor by removing headers.
 */
it('does not change behaviour because the request carries an Origin', function (): void {
    $response = $this->withHeaders(['Origin' => 'http://app.evault.localhost'])
        ->getJson('/api/health');

    $response->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff');

    expect($response->headers->get('Access-Control-Allow-Origin'))->toBeNull();
});
