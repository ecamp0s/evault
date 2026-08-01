<?php

declare(strict_types=1);

use App\Application\Vaults\CreatePersonalVault;
use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Database\QueryException;

it('crea el vault personal y la pertenencia como propietario', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle($user->id);

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

it('genera un identificador uuid y no un entero', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle($user->id);

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

    $primero = $servicio->handle($user->id);
    $segundo = $servicio->handle($user->id);

    expect($segundo->id)->toBe($primero->id);

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseCount('vault_members', 1);
});

it('no crea nada si el usuario no existe', function (): void {
    expect(fn () => (new CreatePersonalVault)->handle(99999))
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
    Vault::factory()->personalDe($user)->create();

    expect(fn () => Vault::factory()->personalDe($user)->create())
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('vaults', 1);
});

it('borrar al usuario se lleva su vault personal', function (): void {
    $user = User::factory()->create();
    (new CreatePersonalVault)->handle($user->id);

    $user->delete();

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_members', 0);
});
