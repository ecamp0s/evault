<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;

/*
 * The migration that discards the version 1 items deletes data, so what it deletes is
 * checked and, above all, what it does not.
 *
 * The reason it exists is in the migration file itself: version 1 was not encryption
 * and cannot be re-encrypted without the user's key, which the server does not have.
 * What makes it legitimate is that it was never deployed with real data.
 */

/** The migration, loaded by hand: RefreshDatabase already ran it over an empty table. */
function discardMigration(): object
{
    return require database_path('migrations/2026_08_02_190000_descartar_vault_items_sin_cifrar.php');
}

it('deletes the version 1 items, which were never encrypted', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    VaultItem::factory()->for($user->personalVault)->create(['version' => 1]);

    discardMigration()->up();

    expect(VaultItem::query()->count())->toBe(0);
});

/*
 * What really has to be guaranteed: that it does not take down genuinely encrypted
 * data, which is beyond recovery. That is why the migration filters by version instead
 * of emptying the table.
 */
it('does not touch the version 2 items, which are encrypted', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $encrypted = VaultItem::factory()->for($user->personalVault)->create(['version' => 2]);
    VaultItem::factory()->for($user->personalVault)->create(['version' => 1]);

    discardMigration()->up();

    expect(VaultItem::query()->pluck('id')->all())->toBe([$encrypted->id]);
});

it('does not touch future versions this server does not know', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    VaultItem::factory()->for($user->personalVault)->create(['version' => 3]);

    discardMigration()->up();

    expect(VaultItem::query()->count())->toBe(1);
});
