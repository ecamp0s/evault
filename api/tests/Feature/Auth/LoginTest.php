<?php

declare(strict_types=1);

use App\Models\User;

beforeEach(function (): void {
    $this->user = User::factory()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
});

it('inicia sesión con credenciales correctas', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])
        ->assertOk()
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email'], 'token']]);
});

it('emite un token utilizable', function (): void {
    $token = $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->json('data.token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

it('rechaza una contraseña incorrecta con 401', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'no-es-la-suya',
    ])->assertUnauthorized();
});

it('rechaza un email que no existe con 401', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'nadie@evault.test',
        'password' => 'contraseña-larga',
    ])->assertUnauthorized();
});

/*
 * Los dos fallos anteriores tienen que ser indistinguibles desde fuera. Si el
 * mensaje difiriera, bastaría con probar correos para averiguar cuáles están
 * registrados en el servicio.
 */
it('no revela si el email existe', function (): void {
    $inexistente = $this->postJson('/api/auth/login', [
        'email' => 'nadie@evault.test',
        'password' => 'da-igual-cual',
    ]);

    $contraseñaMala = $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'no-es-la-suya',
    ]);

    expect($inexistente->json('message'))->toBe($contraseñaMala->json('message'))
        ->and($inexistente->getStatusCode())->toBe($contraseñaMala->getStatusCode());
});

it('acepta el email en mayúsculas', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ADA@Evault.Test',
        'password' => 'contraseña-larga',
    ])->assertOk();
});

it('exige email y contraseña', function (): void {
    $this->postJson('/api/auth/login', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email', 'password']);
});

it('emite un token nuevo en cada inicio de sesión', function (): void {
    $credenciales = ['email' => 'ada@evault.test', 'password' => 'contraseña-larga'];

    $primero = $this->postJson('/api/auth/login', $credenciales)->json('data.token');
    $segundo = $this->postJson('/api/auth/login', $credenciales)->json('data.token');

    expect($primero)->not->toBe($segundo);
    $this->assertDatabaseCount('personal_access_tokens', 2);
});
