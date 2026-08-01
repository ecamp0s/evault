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

/*
 * La invariante sobre la que se apoya el resto de la Iteración 2: quien se
 * registra sale con vault. Se comprueba por HTTP y no solo en el servicio porque
 * lo que importa es que ocurra en el camino real.
 */
it('deja al usuario con su vault personal', function (): void {
    $this->postJson('/api/auth/register', [
        'name' => 'Ada Lovelace',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    expect($user->personalVault)->not->toBeNull()
        ->and($user->vaults)->toHaveCount(1);

    $this->assertDatabaseCount('vaults', 1);
});

/*
 * El contrato no cambia con la llegada de los vaults: la respuesta lleva los
 * mismos campos que en la Iteración 1 y ninguno más. Ver ADR-001 sobre por qué el
 * contrato debe mantenerse estable, y #53 sobre por qué el vault se descubre en
 * su propio endpoint y no colándolo aquí.
 */
it('no filtra el vault en la respuesta del registro', function (): void {
    $respuesta = $this->postJson('/api/auth/register', [
        'name' => 'Ada',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);

    expect(array_keys($respuesta->json('data')))->toBe(['user', 'token'])
        ->and(array_keys($respuesta->json('data.user')))->toBe(['id', 'name', 'email', 'created_at']);
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
