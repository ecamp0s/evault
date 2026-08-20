<?php

declare(strict_types=1);

use App\Application\Vaults\CreateVaultItem;
use App\Application\Vaults\DeleteVaultItem;
use App\Application\Vaults\ListVaultItems;
use App\Application\Vaults\ShowVaultItem;
use App\Application\Vaults\UpdateVaultItem;
use App\Application\Vaults\VaultItemNotFound;
use App\Application\Vaults\VaultItemPayload;
use App\Application\Vaults\VaultNotAccessible;
use App\Models\User;
use App\Models\VaultItem;

/*
 * Second barrier of the double guard. These tests call the services directly, skipping
 * the middleware and the controller entirely, which is the only way to check that the
 * application layer defends itself on its own.
 *
 * If somebody ever builds a console command, a queued job or a new endpoint that calls
 * these services without going through the middleware, this is what guarantees it does
 * not turn into a leak.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create();
    $this->grace = User::factory()->withPersonalVault()->create();

    $this->own = $this->ada->personalVault;
    $this->foreign = $this->grace->personalVault;

    $this->payload = new VaultItemPayload('blob', 'iv', 1);
});

it('listing refuses a vault one is not a member of', function (): void {
    VaultItem::factory()->create(['vault_id' => $this->foreign->id]);

    expect(fn () => app(ListVaultItems::class)->handle($this->ada->id, $this->foreign->id))
        ->toThrow(VaultNotAccessible::class);
});

it('creating refuses a vault one is not a member of and writes nothing', function (): void {
    expect(fn () => app(CreateVaultItem::class)->handle($this->ada->id, $this->foreign->id, $this->payload))
        ->toThrow(VaultNotAccessible::class);

    $this->assertDatabaseCount('vault_items', 0);
});

it('reading refuses a vault one is not a member of', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);

    expect(fn () => app(ShowVaultItem::class)->handle($this->ada->id, $this->foreign->id, $item->id))
        ->toThrow(VaultNotAccessible::class);
});

it('updating refuses a vault one is not a member of and does not touch the row', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->foreign->id, 'ciphertext' => 'original']);

    expect(fn () => app(UpdateVaultItem::class)->handle($this->ada->id, $this->foreign->id, $item->id, $this->payload))
        ->toThrow(VaultNotAccessible::class);

    expect($item->fresh()?->ciphertext)->toBe('original');
});

it('deleting refuses a vault one is not a member of and deletes nothing', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);

    expect(fn () => app(DeleteVaultItem::class)->handle($this->ada->id, $this->foreign->id, $item->id))
        ->toThrow(VaultNotAccessible::class);

    $this->assertDatabaseHas('vault_items', ['id' => $item->id]);
});

/*
 * One's own vault, a real item, but from another vault. It is the case only the scope by
 * vault_id inside the service stops, not the membership check.
 */
it('an item from another vault is not reachable from one\'s own', function (): void {
    $foreign = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);

    expect(fn () => app(ShowVaultItem::class)->handle($this->ada->id, $this->own->id, $foreign->id))
        ->toThrow(VaultItemNotFound::class);

    expect(fn () => app(UpdateVaultItem::class)->handle($this->ada->id, $this->own->id, $foreign->id, $this->payload))
        ->toThrow(VaultItemNotFound::class);

    expect(fn () => app(DeleteVaultItem::class)->handle($this->ada->id, $this->own->id, $foreign->id))
        ->toThrow(VaultItemNotFound::class);

    $this->assertDatabaseHas('vault_items', ['id' => $foreign->id]);
});

it('listing returns only the items of the vault asked for', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->own->id]);
    VaultItem::factory()->count(3)->create(['vault_id' => $this->foreign->id]);

    $items = app(ListVaultItems::class)->handle($this->ada->id, $this->own->id);

    expect($items)->toHaveCount(2)
        ->and($items->pluck('vault_id')->unique()->all())->toBe([$this->own->id]);
});

it('creating stores the payload as it stands', function (): void {
    $item = app(CreateVaultItem::class)->handle(
        $this->ada->id,
        $this->own->id,
        new VaultItemPayload('un-blob-opaco', 'un-nonce', 7),
    );

    expect($item->ciphertext)->toBe('un-blob-opaco')
        ->and($item->iv)->toBe('un-nonce')
        ->and($item->version)->toBe(7)
        ->and($item->vault_id)->toBe($this->own->id);
});

it('updating replaces all three fields at once', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->own->id]);

    $updated = app(UpdateVaultItem::class)->handle(
        $this->ada->id,
        $this->own->id,
        $item->id,
        new VaultItemPayload('nuevo', 'nuevo-iv', 2),
    );

    expect($updated->ciphertext)->toBe('nuevo')
        ->and($updated->iv)->toBe('nuevo-iv')
        ->and($updated->version)->toBe(2)
        ->and($updated->id)->toBe($item->id);
});

it('deleting removes the row', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->own->id]);

    app(DeleteVaultItem::class)->handle($this->ada->id, $this->own->id, $item->id);

    $this->assertDatabaseCount('vault_items', 0);
});

it('an item that exists nowhere also gives VaultItemNotFound', function (): void {
    expect(fn () => app(ShowVaultItem::class)->handle(
        $this->ada->id,
        $this->own->id,
        '019fbe85-0000-7000-8000-000000000000',
    ))->toThrow(VaultItemNotFound::class);
});
