<?php

declare(strict_types=1);

use App\Support\CorsOrigins;

it('parsea una lista separada por comas', function (): void {
    expect(CorsOrigins::fromEnv('http://app.evault.claude,https://app.evault.io'))
        ->toBe(['http://app.evault.claude', 'https://app.evault.io']);
});

it('descarta los espacios alrededor de cada origen', function (): void {
    expect(CorsOrigins::fromEnv(' http://uno.test ,  http://dos.test '))
        ->toBe(['http://uno.test', 'http://dos.test']);
});

it('no permite ningún origen cuando la variable está ausente', function (): void {
    expect(CorsOrigins::fromEnv(null))->toBe([]);
});

it('no permite ningún origen cuando la variable está vacía', function (): void {
    expect(CorsOrigins::fromEnv(''))->toBe([])
        ->and(CorsOrigins::fromEnv('   '))->toBe([])
        ->and(CorsOrigins::fromEnv(',,'))->toBe([]);
});

/*
 * El caso que motiva la clase: nunca degradar a permisivo. Ver ADR-005.
 */
it('descarta el comodín en vez de abrir la API', function (): void {
    expect(CorsOrigins::fromEnv('*'))->toBe([]);
});

it('descarta el comodín aunque venga acompañado de orígenes válidos', function (): void {
    expect(CorsOrigins::fromEnv('http://app.evault.claude,*'))
        ->toBe(['http://app.evault.claude']);
});

it('no permite ningún origen cuando el valor no es una cadena', function (): void {
    expect(CorsOrigins::fromEnv(true))->toBe([])
        ->and(CorsOrigins::fromEnv(42))->toBe([]);
});
