<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;

/*
 * La migración que descarta los items de la versión 1 borra datos, así que se
 * comprueba lo que borra y, sobre todo, lo que no.
 *
 * El motivo de que exista está en el propio fichero de la migración: la versión 1
 * no era cifrado y no se puede recifrar sin la clave del usuario, que el servidor
 * no tiene. Lo que la hace legítima es que nunca se desplegó con datos reales.
 */

/** La migración, cargada a mano: RefreshDatabase ya la ejecutó sobre una tabla vacía. */
function discardMigration(): object
{
    return require database_path('migrations/2026_08_02_190000_descartar_vault_items_sin_cifrar.php');
}

it('borra los items de la versión 1, que nunca estuvieron cifrados', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    VaultItem::factory()->for($user->personalVault)->create(['version' => 1]);

    discardMigration()->up();

    expect(VaultItem::query()->count())->toBe(0);
});

/*
 * Lo que de verdad hay que garantizar: que no se lleve por delante datos cifrados
 * de verdad, que sí son irrecuperables. Por eso la migración filtra por versión en
 * vez de vaciar la tabla.
 */
it('no toca los items de la versión 2, que sí están cifrados', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $encrypted = VaultItem::factory()->for($user->personalVault)->create(['version' => 2]);
    VaultItem::factory()->for($user->personalVault)->create(['version' => 1]);

    discardMigration()->up();

    expect(VaultItem::query()->pluck('id')->all())->toBe([$encrypted->id]);
});

it('no toca versiones futuras que este servidor no conoce', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    VaultItem::factory()->for($user->personalVault)->create(['version' => 3]);

    discardMigration()->up();

    expect(VaultItem::query()->count())->toBe(1);
});
