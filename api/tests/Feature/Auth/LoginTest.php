<?php

declare(strict_types=1);

use App\Models\User;

beforeEach(function (): void {
    $this->user = User::factory()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
});

it('signs in with the right credentials', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])
        ->assertOk()
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email'], 'token']]);
});

it('issues a usable token', function (): void {
    $token = $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->json('data.token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk();
});

it('refuses a wrong password with a 401', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'no-es-la-suya',
    ])->assertUnauthorized();
});

it('refuses an email that does not exist with a 401', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'nadie@evault.test',
        'password' => 'contraseña-larga',
    ])->assertUnauthorized();
});

/*
 * The two failures above have to be indistinguishable from the outside. Were the
 * message to differ, trying emails would be enough to work out which are registered in
 * the service.
 */
it('does not reveal whether the email exists', function (): void {
    $missing = $this->postJson('/api/auth/login', [
        'email' => 'nadie@evault.test',
        'password' => 'da-igual-cual',
    ]);

    $wrongPassword = $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'no-es-la-suya',
    ]);

    expect($missing->json('message'))->toBe($wrongPassword->json('message'))
        ->and($missing->getStatusCode())->toBe($wrongPassword->getStatusCode());
});

it('accepts the email in capitals', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ADA@Evault.Test',
        'password' => 'contraseña-larga',
    ])->assertOk();
});

it('demands email and password', function (): void {
    $this->postJson('/api/auth/login', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email', 'password']);
});

it('issues a new token on every sign-in', function (): void {
    $credentials = ['email' => 'ada@evault.test', 'password' => 'contraseña-larga'];

    $first = $this->postJson('/api/auth/login', $credentials)->json('data.token');
    $second = $this->postJson('/api/auth/login', $credentials)->json('data.token');

    expect($first)->not->toBe($second);
    $this->assertDatabaseCount('personal_access_tokens', 2);
});
