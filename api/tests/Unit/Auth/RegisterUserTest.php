<?php

declare(strict_types=1);

use App\Application\Auth\EmailAlreadyRegistered;
use App\Application\Auth\RegisterUser;
use App\Models\User;

it('crea el usuario y devuelve un token en claro', function (): void {
    $resultado = (new RegisterUser)->handle('Ada Lovelace', 'ada@evault.test', 'contraseña-larga');

    expect($resultado->user)->toBeInstanceOf(User::class)
        ->and($resultado->user->email)->toBe('ada@evault.test')
        ->and($resultado->user->name)->toBe('Ada Lovelace')
        ->and($resultado->token)->not->toBeEmpty();

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('personal_access_tokens', 1);
});

it('hashea la contraseña', function (): void {
    $resultado = (new RegisterUser)->handle('Ada', 'ada@evault.test', 'contraseña-larga');

    expect($resultado->user->password)->not->toBe('contraseña-larga')
        ->and(Hash::check('contraseña-larga', $resultado->user->password))->toBeTrue();
});

it('normaliza el email y recorta el nombre', function (): void {
    $resultado = (new RegisterUser)->handle('  Ada  ', '  ADA@Evault.Test  ', 'contraseña-larga');

    expect($resultado->user->email)->toBe('ada@evault.test')
        ->and($resultado->user->name)->toBe('Ada');
});

/*
 * Segunda barrera del double guard. El Form Request no interviene aquí, así que
 * este test comprueba que el servicio se defiende por su cuenta.
 */
it('rechaza un email ya registrado aunque no pase por el Form Request', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    expect(fn () => (new RegisterUser)->handle('Ada', 'ada@evault.test', 'contraseña-larga'))
        ->toThrow(EmailAlreadyRegistered::class);

    $this->assertDatabaseCount('users', 1);
});

it('rechaza un email duplicado que solo difiere en mayúsculas', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    expect(fn () => (new RegisterUser)->handle('Ada', 'ADA@EVAULT.TEST', 'contraseña-larga'))
        ->toThrow(EmailAlreadyRegistered::class);
});

it('no deja al usuario a medias si el alta falla', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    try {
        (new RegisterUser)->handle('Ada', 'ada@evault.test', 'contraseña-larga');
    } catch (EmailAlreadyRegistered) {
        // esperado
    }

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('personal_access_tokens', 0);
});
