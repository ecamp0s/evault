<?php

declare(strict_types=1);

use App\Models\User;

beforeEach(function (): void {
    $this->user = User::factory()->create(['email' => 'ada@evault.test']);
    $this->token = $this->user->createToken('api')->plainTextToken;
});

it('devuelve el usuario autenticado', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.id', $this->user->id)
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'created_at']]]);
});

it('no expone campos sensibles en el usuario', function (): void {
    $response = $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me');

    expect($response->json('data.user'))->not->toHaveKeys(['password', 'remember_token']);
});

/*
 * La otra mitad del issue #149: que la caducidad no sea solo una columna escrita.
 * Un token vencido tiene que ser rechazado por la API, porque de ese 401 depende que
 * el cliente cierre la sesión —lo hace en el interceptor de lib/session.ts— y mande
 * a pedir la contraseña maestra otra vez.
 *
 * Se comprueba con un token vencido a mano y no esperando doce horas, claro; lo que
 * importa es que el rechazo ocurra y no que el reloj funcione.
 */
it('rechaza un token caducado', function (): void {
    $caducado = $this->user->createToken('api', ['*'], now()->subMinute())->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$caducado}")
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

it('acepta un token que aún no ha caducado', function (): void {
    $vivo = $this->user->createToken('api', ['*'], now()->addMinute())->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$vivo}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

it('rechaza me sin token', function (): void {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

it('revoca el token al cerrar sesión', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    $this->assertDatabaseCount('personal_access_tokens', 0);

    forgetResolvedSession();

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

it('rechaza cerrar sesión sin token', function (): void {
    $this->postJson('/api/auth/logout')->assertUnauthorized();
});

/*
 * Cerrar sesión en un dispositivo no debe cerrarla en los demás, así que solo se
 * revoca el token con el que se hizo la petición.
 */
it('no revoca los demás tokens del usuario', function (): void {
    $otherToken = $this->user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    $this->assertDatabaseCount('personal_access_tokens', 1);

    forgetResolvedSession();

    $this->withHeader('Authorization', "Bearer {$otherToken}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

/*
 * Aislamiento entre usuarios: el token de uno no puede revocar el de otro ni leer
 * sus datos. Hoy la ruta no admite pasar un identificador ajeno, pero el test fija
 * la garantía por si mañana lo admitiera.
 */
it('no permite que el token de un usuario afecte a otro', function (): void {
    $otherUser = User::factory()->create(['email' => 'otro@evault.test']);
    $foreignToken = $otherUser->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    forgetResolvedSession();

    $this->withHeader('Authorization', "Bearer {$foreignToken}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.email', 'otro@evault.test');
});

it('es idempotente al repetir el cierre de sesión', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    forgetResolvedSession();

    // El segundo intento llega ya sin token válido, así que la respuesta correcta
    // es 401 y no un error del servidor.
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertUnauthorized();
});
