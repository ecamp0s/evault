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
    $respuesta = $this->withHeader('Authorization', "Bearer {$this->token}")
        ->getJson('/api/auth/me');

    expect($respuesta->json('data.user'))->not->toHaveKeys(['password', 'remember_token']);
});

it('rechaza me sin token', function (): void {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

it('revoca el token al cerrar sesión', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    $this->assertDatabaseCount('personal_access_tokens', 0);

    olvidarSesionResuelta();

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
    $otroToken = $this->user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    $this->assertDatabaseCount('personal_access_tokens', 1);

    olvidarSesionResuelta();

    $this->withHeader('Authorization', "Bearer {$otroToken}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

/*
 * Aislamiento entre usuarios: el token de uno no puede revocar el de otro ni leer
 * sus datos. Hoy la ruta no admite pasar un identificador ajeno, pero el test fija
 * la garantía por si mañana lo admitiera.
 */
it('no permite que el token de un usuario afecte a otro', function (): void {
    $otroUsuario = User::factory()->create(['email' => 'otro@evault.test']);
    $tokenAjeno = $otroUsuario->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    olvidarSesionResuelta();

    $this->withHeader('Authorization', "Bearer {$tokenAjeno}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.email', 'otro@evault.test');
});

it('es idempotente al repetir el cierre de sesión', function (): void {
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertNoContent();

    olvidarSesionResuelta();

    // El segundo intento llega ya sin token válido, así que la respuesta correcta
    // es 401 y no un error del servidor.
    $this->withHeader('Authorization', "Bearer {$this->token}")
        ->postJson('/api/auth/logout')
        ->assertUnauthorized();
});
