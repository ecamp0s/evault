<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;

/*
 * Cross-tenant isolation over the three bin endpoints, with the same rule as the items:
 * always 404, never 403, and somebody else's and a missing one answer exactly alike.
 * Somebody else's bin is as much their data as their vault. See ADR-004.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create();
    $this->grace = User::factory()->withPersonalVault()->create();

    $this->own = $this->ada->personalVault;
    $this->foreign = $this->grace->personalVault;

    $this->token = $this->ada->createToken('api')->plainTextToken;
    $this->asAda = fn () => $this->withHeader('Authorization', "Bearer {$this->token}");

    $this->binned = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $this->binned->delete();
});

it('listing somebody else\'s bin returns 404', function (): void {
    ($this->asAda)()->getJson("/api/vaults/{$this->foreign->id}/trash")->assertNotFound();
});

it('restoring and purging from somebody else\'s bin return 404 and touch nothing', function (): void {
    $base = "/api/vaults/{$this->foreign->id}/trash/{$this->binned->id}";

    ($this->asAda)()->postJson("{$base}/restore")->assertNotFound();
    ($this->asAda)()->deleteJson($base)->assertNotFound();

    $this->assertSoftDeleted('vault_items', ['id' => $this->binned->id]);
});

/*
 * The subtle case again: one's own vault in the route, so the middleware lets it in,
 * and a real identifier of somebody else's binned item. Only the scope inside the
 * service stops it.
 */
it('somebody else\'s binned item asked for from one\'s own bin returns 404', function (): void {
    $base = "/api/vaults/{$this->own->id}/trash/{$this->binned->id}";

    ($this->asAda)()->postJson("{$base}/restore")->assertNotFound();
    ($this->asAda)()->deleteJson($base)->assertNotFound();

    $this->assertSoftDeleted('vault_items', ['id' => $this->binned->id]);
});

it('one\'s own bin never lists another\'s items', function (): void {
    $mine = VaultItem::factory()->create(['vault_id' => $this->own->id]);
    $mine->delete();

    expect(($this->asAda)()->getJson("/api/vaults/{$this->own->id}/trash")->json('data.items.*.id'))
        ->toBe([$mine->id]);
});

it('somebody else\'s binned item and one that does not exist answer exactly alike', function (): void {
    $missing = '019fbe85-0000-7000-8000-000000000001';
    $base = "/api/vaults/{$this->own->id}/trash";

    foreach ([
        fn (string $id) => ($this->asAda)()->postJson("{$base}/{$id}/restore"),
        fn (string $id) => ($this->asAda)()->deleteJson("{$base}/{$id}"),
    ] as $call) {
        $fromForeign = $call($this->binned->id);
        $fromMissing = $call($missing);

        expect($fromForeign->status())->toBe($fromMissing->status())
            ->and($fromForeign->json())->toBe($fromMissing->json());
    }
});
