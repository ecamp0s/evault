<?php

declare(strict_types=1);

use App\Application\Vaults\CreatePersonalVault;
use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Database\QueryException;

it('crea el vault personal y la pertenencia como propietario', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle($user->id, wrappedKey());

    expect($vault->personal_for_user_id)->toBe($user->id)
        ->and($vault->isPersonal())->toBeTrue()
        ->and($vault->members)->toHaveCount(1)
        ->and($vault->members->first()?->id)->toBe($user->id);

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault->id,
        'user_id' => $user->id,
        'role' => VaultRole::Owner->value,
    ]);
});

it('guarda la clave envuelta que recibe', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle(
        $user->id,
        wrappedKey('la-clave-envuelta', 'el-nonce'),
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault->id,
        'user_id' => $user->id,
        'wrapped_key' => 'la-clave-envuelta',
        'wrapped_key_iv' => 'el-nonce',
    ]);
});

/*
 * La cara peligrosa de la idempotencia. El servicio existe también para reparar a
 * un usuario que se hubiera quedado sin vault, así que puede llamarse sobre uno que
 * ya lo tiene; si en ese caso sobrescribiera la clave envuelta, los items de esa
 * vault quedarían cifrados con una clave que ya nadie tiene, y eso no se deshace ni
 * con la contraseña correcta.
 *
 * Reenvolver la clave existente es otra operación —la del cambio de contraseña
 * maestra— y necesita la clave vieja para hacerse bien.
 */
it('no pisa la clave envuelta de un vault que ya existe', function (): void {
    $user = User::factory()->create();
    $servicio = new CreatePersonalVault;

    $servicio->handle($user->id, wrappedKey('la-buena', 'nonce-bueno'));
    $servicio->handle($user->id, wrappedKey('la-que-llega-despues', 'otro-nonce'));

    $this->assertDatabaseHas('vault_members', [
        'user_id' => $user->id,
        'wrapped_key' => 'la-buena',
        'wrapped_key_iv' => 'nonce-bueno',
    ]);

    $this->assertDatabaseMissing('vault_members', ['wrapped_key' => 'la-que-llega-despues']);
});

/*
 * La base de datos no admite una pertenencia sin clave envuelta, y no solo el
 * servicio. Se comprueba saltándose el servicio, que es la única forma de saber que
 * la restricción existe de verdad: un miembro sin clave es alguien que no puede
 * abrir su propia vault.
 */
it('la base de datos rechaza una pertenencia sin clave envuelta', function (): void {
    $user = User::factory()->create();
    $vault = Vault::factory()->create();

    expect(fn () => $vault->members()->attach($user->id, ['role' => VaultRole::Owner->value]))
        ->toThrow(QueryException::class);
});

it('genera un identificador uuid y no un entero', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle($user->id, wrappedKey());

    expect($vault->id)->toBeString()
        ->and(Str::isUuid($vault->id))->toBeTrue();
});

/*
 * Idempotencia. Un reintento del alta no debe estrellarse contra el índice único
 * ni dejar al usuario con dos vaults personales.
 */
it('devuelve el vault existente en vez de crear un segundo', function (): void {
    $user = User::factory()->create();
    $servicio = new CreatePersonalVault;

    $first = $servicio->handle($user->id, wrappedKey());
    $second = $servicio->handle($user->id, wrappedKey());

    expect($second->id)->toBe($first->id);

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseCount('vault_members', 1);
});

it('no crea nada si el usuario no existe', function (): void {
    expect(fn () => (new CreatePersonalVault)->handle(99999, wrappedKey()))
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_members', 0);
});

/*
 * La garantía de que nadie tiene dos vaults personales vive en la base de datos y
 * no solo en el servicio. Este test la comprueba saltándose el servicio por
 * completo, que es la única forma de saber que el índice existe de verdad.
 */
it('la base de datos impide un segundo vault personal para el mismo usuario', function (): void {
    $user = User::factory()->create();
    Vault::factory()->personalFor($user)->create();

    expect(fn () => Vault::factory()->personalFor($user)->create())
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('vaults', 1);
});

it('borrar al usuario se lleva su vault personal', function (): void {
    $user = User::factory()->create();
    (new CreatePersonalVault)->handle($user->id, wrappedKey());

    $user->delete();

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_members', 0);
});
