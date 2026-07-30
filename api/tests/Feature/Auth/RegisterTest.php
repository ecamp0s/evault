<?php

declare(strict_types=1);

use App\Models\User;

it('registra un usuario y devuelve un token', function (): void {
    $respuesta = $this->postJson('/api/auth/register', [
        'name' => 'Ada Lovelace',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);

    $respuesta->assertCreated()
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonPath('data.user.name', 'Ada Lovelace')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'created_at'], 'token']]);

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
});

it('nunca devuelve la contraseña en la respuesta', function (): void {
    $respuesta = $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);

    expect($respuesta->json('data.user'))->not->toHaveKeys(['password', 'remember_token']);
});

it('hashea la contraseña en vez de guardarla en claro', function (): void {
    $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    expect($user->password)->not->toBe('contraseña-larga')
        ->and(Hash::check('contraseña-larga', $user->password))->toBeTrue();
});

it('emite un token que sirve para autenticarse', function (): void {
    $token = $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->json('data.token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.email', 'ada@evault.test');
});

it('rechaza un email ya registrado', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    $this->postJson('/api/auth/register', [
        'name' => 'Otra Ada',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});

/*
 * El correo se normaliza antes de comprobar la unicidad, así que dos altas que
 * solo difieren en mayúsculas son la misma cuenta y la segunda debe fallar.
 */
it('trata el email como insensible a mayúsculas', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    $this->postJson('/api/auth/register', [
        'name' => 'Otra Ada',
        'email' => 'ADA@evault.test',
        'password' => 'contraseña-larga',
    ])->assertStatus(422);
});

it('normaliza el email que guarda', function (): void {
    $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => '  ADA@Evault.Test  ',
        'password' => 'contraseña-larga',
    ])->assertCreated();

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
});

it('exige los tres campos', function (): void {
    $this->postJson('/api/auth/register', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'email', 'password']);
});

it('rechaza una contraseña demasiado corta', function (): void {
    $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => 'ada@evault.test',
        'password' => 'corta',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('password');
});

it('rechaza un email con formato inválido', function (): void {
    $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => 'esto-no-es-un-email',
        'password' => 'contraseña-larga',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});
