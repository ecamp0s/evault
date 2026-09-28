<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Support\Carbon;

/*
 * The bin of ADR-018 §2.4, through the API: deleting leaves the entry thirty days on the
 * server, from where it comes back as the same entry, or goes for good by a second,
 * deliberate step.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create();
    $this->vault = $this->user->personalVault;
    $this->token = $this->user->createToken('api')->plainTextToken;

    $this->asUser = fn () => $this->withHeader('Authorization', "Bearer {$this->token}");
    $this->items = "/api/vaults/{$this->vault->id}/items";
    $this->trash = "/api/vaults/{$this->vault->id}/trash";
});

afterEach(function (): void {
    Carbon::setTestNow();
});

it('a deleted item leaves the listing and appears in the bin', function (): void {
    $kept = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $deleted = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->asUser)()->deleteJson("{$this->items}/{$deleted->id}")->assertNoContent();

    $listed = ($this->asUser)()->getJson($this->items)->assertOk()->json('data.items.*.id');
    $binned = ($this->asUser)()->getJson($this->trash)->assertOk()->json('data.items.*.id');

    expect($listed)->toBe([$kept->id])
        ->and($binned)->toBe([$deleted->id]);
});

it('an item in the bin cannot be read, edited or deleted again through the items', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    ($this->asUser)()->deleteJson("{$this->items}/{$item->id}")->assertNoContent();

    ($this->asUser)()->getJson("{$this->items}/{$item->id}")->assertNotFound();
    ($this->asUser)()
        ->patchJson("{$this->items}/{$item->id}", ['ciphertext' => 'otro', 'iv' => 'iv', 'version' => 1])
        ->assertNotFound();

    // A retry of the same DELETE finds nothing, and above all it does not purge.
    ($this->asUser)()->deleteJson("{$this->items}/{$item->id}")->assertNotFound();

    $this->assertSoftDeleted('vault_items', ['id' => $item->id, 'ciphertext' => $item->ciphertext]);
});

it('the bin says when each item was deleted and when the purge takes it', function (): void {
    Carbon::setTestNow('2026-09-28 10:00:00');
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    ($this->asUser)()->deleteJson("{$this->items}/{$item->id}")->assertNoContent();

    $binned = ($this->asUser)()->getJson($this->trash)->assertOk()->json('data.items.0');

    // Thirty days, written as dates and not against the constant (ADR-018 §4).
    expect(Carbon::parse($binned['deleted_at'])->toDateTimeString())->toBe('2026-09-28 10:00:00')
        ->and(Carbon::parse($binned['purges_at'])->toDateTimeString())->toBe('2026-10-28 10:00:00');
});

it('the bin exposes the fields of an item plus its two dates, and nothing else', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    ($this->asUser)()->deleteJson("{$this->items}/{$item->id}")->assertNoContent();

    $binned = ($this->asUser)()->getJson($this->trash)->json('data.items.0');

    expect(array_keys($binned))->toBe([
        'id', 'vault_id', 'ciphertext', 'iv', 'version',
        'created_at', 'updated_at', 'deleted_at', 'purges_at',
    ]);
});

it('the bin lists the most recently deleted first', function (): void {
    [$first, $second] = VaultItem::factory()->count(2)->create(['vault_id' => $this->vault->id]);

    Carbon::setTestNow('2026-09-01 10:00:00');
    ($this->asUser)()->deleteJson("{$this->items}/{$first->id}")->assertNoContent();
    Carbon::setTestNow('2026-09-02 10:00:00');
    ($this->asUser)()->deleteJson("{$this->items}/{$second->id}")->assertNoContent();

    expect(($this->asUser)()->getJson($this->trash)->json('data.items.*.id'))
        ->toBe([$second->id, $first->id]);
});

it('restoring brings back the same entry, with its id, its blob and its dates', function (): void {
    Carbon::setTestNow('2026-09-01 10:00:00');
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $before = VaultItem::query()->whereKey($item->id)->sole()->getAttributes();

    Carbon::setTestNow('2026-09-05 10:00:00');
    ($this->asUser)()->deleteJson("{$this->items}/{$item->id}")->assertNoContent();
    Carbon::setTestNow('2026-09-09 10:00:00');
    $restored = ($this->asUser)()->postJson("{$this->trash}/{$item->id}/restore")->assertOk()->json('data.item');

    $after = VaultItem::query()->whereKey($item->id)->sole()->getAttributes();

    // Deleting and restoring is not modifying: «recently modified» must not move.
    expect($after)->toBe($before)
        ->and($restored['id'])->toBe($item->id)
        ->and(($this->asUser)()->getJson($this->items)->json('data.items.*.id'))->toBe([$item->id])
        ->and(($this->asUser)()->getJson($this->trash)->json('data.items'))->toBe([]);
});

it('a live item cannot be restored or purged', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->asUser)()->postJson("{$this->trash}/{$item->id}/restore")->assertNotFound();
    ($this->asUser)()->deleteJson("{$this->trash}/{$item->id}")->assertNotFound();

    $this->assertNotSoftDeleted('vault_items', ['id' => $item->id]);
});

it('purging an item from the bin removes the row for good', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    ($this->asUser)()->deleteJson("{$this->items}/{$item->id}")->assertNoContent();

    ($this->asUser)()->deleteJson("{$this->trash}/{$item->id}")->assertNoContent();

    $this->assertDatabaseMissing('vault_items', ['id' => $item->id]);
    ($this->asUser)()->postJson("{$this->trash}/{$item->id}/restore")->assertNotFound();
});

it('all three bin endpoints demand authentication', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $item->delete();

    $this->getJson($this->trash)->assertUnauthorized();
    $this->postJson("{$this->trash}/{$item->id}/restore")->assertUnauthorized();
    $this->deleteJson("{$this->trash}/{$item->id}")->assertUnauthorized();

    $this->assertSoftDeleted('vault_items', ['id' => $item->id]);
});
