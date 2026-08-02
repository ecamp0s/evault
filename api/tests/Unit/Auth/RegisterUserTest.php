<?php

declare(strict_types=1);

use App\Application\Auth\EmailAlreadyRegistered;
use App\Application\Auth\RegisterUser;
use App\Models\User;
use App\Models\VaultRole;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

it('crea el usuario y devuelve un token en claro', function (): void {
    $resultado = app(RegisterUser::class)->handle('Ada Lovelace', 'ada@evault.test', 'contraseña-larga', claveEnvuelta());

    expect($resultado->user)->toBeInstanceOf(User::class)
        ->and($resultado->user->email)->toBe('ada@evault.test')
        ->and($resultado->user->name)->toBe('Ada Lovelace')
        ->and($resultado->token)->not->toBeEmpty();

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('personal_access_tokens', 1);
});

it('hashea la contraseña', function (): void {
    $resultado = app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', claveEnvuelta());

    expect($resultado->user->password)->not->toBe('contraseña-larga')
        ->and(Hash::check('contraseña-larga', $resultado->user->password))->toBeTrue();
});

it('normaliza el email y recorta el nombre', function (): void {
    $resultado = app(RegisterUser::class)->handle('  Ada  ', '  ADA@Evault.Test  ', 'contraseña-larga', claveEnvuelta());

    expect($resultado->user->email)->toBe('ada@evault.test')
        ->and($resultado->user->name)->toBe('Ada');
});

/*
 * Segunda barrera del double guard. El Form Request no interviene aquí, así que
 * este test comprueba que el servicio se defiende por su cuenta.
 */
it('rechaza un email ya registrado aunque no pase por el Form Request', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    expect(fn () => app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', claveEnvuelta()))
        ->toThrow(EmailAlreadyRegistered::class);

    $this->assertDatabaseCount('users', 1);
});

it('rechaza un email duplicado que solo difiere en mayúsculas', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    expect(fn () => app(RegisterUser::class)->handle('Ada', 'ADA@EVAULT.TEST', 'contraseña-larga', claveEnvuelta()))
        ->toThrow(EmailAlreadyRegistered::class);
});

it('no deja al usuario a medias si el alta falla', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    try {
        app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', claveEnvuelta());
    } catch (EmailAlreadyRegistered) {
        // esperado
    }

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('personal_access_tokens', 0);
});

it('crea el vault personal del usuario dentro del alta', function (): void {
    $resultado = app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', claveEnvuelta());

    $vault = $resultado->user->personalVault;

    expect($vault)->not->toBeNull()
        ->and($vault?->isPersonal())->toBeTrue();

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault?->id,
        'user_id' => $resultado->user->id,
        'role' => VaultRole::Owner->value,
    ]);
});

/*
 * El criterio de reversión del issue: si el vault no se puede crear, no debe
 * quedar un usuario sin vault, porque el resto de la iteración da por hecho que
 * siempre hay uno.
 *
 * El fallo se provoca quitando la tabla de pertenencia en vez de sustituyendo el
 * servicio por un doble. Es a propósito: CreatePersonalVault es final, y de esta
 * forma lo que se ejercita es el camino de error de verdad, con su excepción real
 * subiendo por la transacción, en lugar de una simulación que podría no
 * parecerse. Funciona porque SQLite admite DDL dentro de una transacción, y los
 * tests siempre corren sobre SQLite.
 */
it('no deja usuario ni token si falla la creación del vault', function (): void {
    Schema::drop('vault_members');

    expect(fn () => app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', claveEnvuelta()))
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('personal_access_tokens', 0);
});
