<?php

declare(strict_types=1);

use App\Models\User;

it('rechaza una ruta protegida sin token', function (): void {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

/*
 * Un cliente que no negocie el tipo de contenido debe recibir el mismo 401 en
 * JSON, no una redirección a una ruta 'login' inexistente que acabaría en 500.
 */
it('rechaza sin token también cuando el cliente no pide JSON', function (): void {
    $this->get('/api/auth/me')
        ->assertUnauthorized()
        ->assertHeader('Content-Type', 'application/json');
});

it('acepta una ruta protegida con un token válido', function (): void {
    $user = User::factory()->create();
    $token = $user->createToken('test')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.id', $user->id)
        ->assertJsonPath('data.user.email', $user->email);
});

it('rechaza un token que no existe', function (): void {
    $this->withHeader('Authorization', 'Bearer 1|noexiste')
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

/*
 * La razón por la que config/sanctum.php deja 'guard' en lista vacía. Con el
 * ['web'] que trae por defecto, este test devolvería 200 y la API dejaría de ser
 * stateless sin que nadie se diera cuenta. Ver ADR-004.
 */
it('no autentica por sesión, solo por token', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/auth/me')
        ->assertUnauthorized();
});

it('emite el token en la tabla personal_access_tokens', function (): void {
    $user = User::factory()->create();
    $user->createToken('test');

    $this->assertDatabaseHas('personal_access_tokens', [
        'tokenable_id' => $user->id,
        'tokenable_type' => User::class,
        'name' => 'test',
    ]);
});
