<?php

declare(strict_types=1);

use App\Application\Vaults\ListTrashedVaultItems;
use App\Application\Vaults\ListVaultItems;
use App\Application\Vaults\PurgeVaultItem;
use App\Application\Vaults\RestoreVaultItem;
use App\Application\Vaults\VaultItemNotFound;
use App\Application\Vaults\VaultNotAccessible;
use App\Models\User;
use App\Models\VaultItem;

/*
 * Second barrier of the double guard for the bin: the services called directly, with no
 * middleware in front, as a console command or the purge of #708 would call them.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create();
    $this->grace = User::factory()->withPersonalVault()->create();

    $this->own = $this->ada->personalVault;
    $this->foreign = $this->grace->personalVault;
});

it('listing the bin refuses a vault one is not a member of', function (): void {
    VaultItem::factory()->create(['vault_id' => $this->foreign->id])->delete();

    expect(fn () => app(ListTrashedVaultItems::class)->handle($this->ada->id, $this->foreign->id))
        ->toThrow(VaultNotAccessible::class);
});

it('restoring and purging refuse a vault one is not a member of and touch nothing', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $item->delete();

    expect(fn () => app(RestoreVaultItem::class)->handle($this->ada->id, $this->foreign->id, $item->id))
        ->toThrow(VaultNotAccessible::class)
        ->and(fn () => app(PurgeVaultItem::class)->handle($this->ada->id, $this->foreign->id, $item->id))
        ->toThrow(VaultNotAccessible::class);

    $this->assertSoftDeleted('vault_items', ['id' => $item->id]);
});

it('restoring and purging refuse another vault\'s item from one\'s own vault', function (): void {
    $foreign = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $foreign->delete();

    expect(fn () => app(RestoreVaultItem::class)->handle($this->ada->id, $this->own->id, $foreign->id))
        ->toThrow(VaultItemNotFound::class)
        ->and(fn () => app(PurgeVaultItem::class)->handle($this->ada->id, $this->own->id, $foreign->id))
        ->toThrow(VaultItemNotFound::class);

    $this->assertSoftDeleted('vault_items', ['id' => $foreign->id]);
});

it('the listing of items leaves the bin out, and the bin leaves the items out', function (): void {
    $live = VaultItem::factory()->create(['vault_id' => $this->own->id]);
    $binned = VaultItem::factory()->create(['vault_id' => $this->own->id]);
    $binned->delete();

    $items = app(ListVaultItems::class)->handle($this->ada->id, $this->own->id);
    $trash = app(ListTrashedVaultItems::class)->handle($this->ada->id, $this->own->id);

    expect($items->pluck('id')->all())->toBe([$live->id])
        ->and($trash->pluck('id')->all())->toBe([$binned->id]);
});

it('purging only reaches the bin: a live item is not found and stays', function (): void {
    $live = VaultItem::factory()->create(['vault_id' => $this->own->id]);

    expect(fn () => app(PurgeVaultItem::class)->handle($this->ada->id, $this->own->id, $live->id))
        ->toThrow(VaultItemNotFound::class);

    $this->assertNotSoftDeleted('vault_items', ['id' => $live->id]);
});
