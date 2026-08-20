<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultItem;

/*
 * Cross-tenant isolation over the five endpoints. ADR-004 declares them mandatory: a
 * service that touches vault data without these tests is considered incomplete, and
 * the failure they prevent — a query with no vault_id returning another user's data —
 * is the worst possible in this product.
 *
 * The rule that runs through the whole file: always 404, never 403. A 403 would confirm
 * the identifier exists, and with that other people's vaults and items can be
 * enumerated without ever being read.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create();
    $this->grace = User::factory()->withPersonalVault()->create();

    $this->own = $this->ada->personalVault;
    $this->foreign = $this->grace->personalVault;

    $this->token = $this->ada->createToken('api')->plainTextToken;
    $this->asAda = fn () => $this->withHeader('Authorization', "Bearer {$this->token}");

    $this->payload = ['ciphertext' => 'blob', 'iv' => 'iv', 'version' => 1];
});

it('listing the items of somebody else\'s vault returns 404', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->foreign->id]);

    ($this->asAda)()
        ->getJson("/api/vaults/{$this->foreign->id}/items")
        ->assertNotFound();
});

it('creating an item in somebody else\'s vault returns 404 and writes nothing', function (): void {
    ($this->asAda)()
        ->postJson("/api/vaults/{$this->foreign->id}/items", $this->payload)
        ->assertNotFound();

    $this->assertDatabaseCount('vault_items', 0);
});

it('reading, updating and deleting somebody else\'s item returns 404 in all three cases', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $base = "/api/vaults/{$this->foreign->id}/items/{$item->id}";

    ($this->asAda)()->getJson($base)->assertNotFound();
    ($this->asAda)()->patchJson($base, $this->payload)->assertNotFound();
    ($this->asAda)()->deleteJson($base)->assertNotFound();

    // And it is still there: a 404 cannot be a silent deletion.
    $this->assertDatabaseHas('vault_items', ['id' => $item->id]);
});

/*
 * The subtlest case, and the one a badly written scope would let through: the route's
 * vault is one's own, so the middleware lets it in, and the item's identifier is real.
 * Only the scope by vault_id inside the service stops it.
 */
it('somebody else\'s item asked for from one\'s own vault returns 404', function (): void {
    $foreign = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $base = "/api/vaults/{$this->own->id}/items/{$foreign->id}";

    ($this->asAda)()->getJson($base)->assertNotFound();
    ($this->asAda)()->patchJson($base, $this->payload)->assertNotFound();
    ($this->asAda)()->deleteJson($base)->assertNotFound();

    $this->assertDatabaseHas('vault_items', ['id' => $foreign->id]);
});

it('the listing of one\'s own vault never includes another\'s items', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->own->id]);
    VaultItem::factory()->count(5)->create(['vault_id' => $this->foreign->id]);

    $returnedItems = ($this->asAda)()
        ->getJson("/api/vaults/{$this->own->id}/items")
        ->assertOk()
        ->json('data.items');

    expect($returnedItems)->toHaveCount(2);

    foreach ($returnedItems as $item) {
        expect($item['vault_id'])->toBe($this->own->id);
    }
});

/*
 * The property that makes the 404 worth anything: somebody else's vault and an invented
 * one have to answer exactly the same. Were they distinguishable, the 404 would hide
 * nothing and would serve as an oracle of existence.
 */
it('somebody else\'s vault and one that does not exist answer exactly alike', function (): void {
    $missing = '019fbe85-0000-7000-8000-000000000000';

    $fromForeign = ($this->asAda)()->getJson("/api/vaults/{$this->foreign->id}/items");
    $fromMissing = ($this->asAda)()->getJson("/api/vaults/{$missing}/items");

    expect($fromForeign->status())->toBe($fromMissing->status())
        ->and($fromForeign->json())->toBe($fromMissing->json());
});

it('somebody else\'s item and one that does not exist answer exactly alike', function (): void {
    $foreign = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $missing = '019fbe85-0000-7000-8000-000000000001';

    $fromForeign = ($this->asAda)()->getJson("/api/vaults/{$this->own->id}/items/{$foreign->id}");
    $fromMissing = ($this->asAda)()->getJson("/api/vaults/{$this->own->id}/items/{$missing}");

    expect($fromForeign->status())->toBe($fromMissing->status())
        ->and($fromForeign->json())->toBe($fromMissing->json());
});

/*
 * Belonging to some vault gives no access to the rest. Shared vaults do not exist today,
 * but a vault with no personal owner is already representable and it is worth pinning
 * the rule before they arrive.
 */
it('belonging to one vault gives no access to another one does not belong to', function (): void {
    $shared = Vault::factory()->create();
    VaultItem::factory()->create(['vault_id' => $shared->id]);

    ($this->asAda)()
        ->getJson("/api/vaults/{$shared->id}/items")
        ->assertNotFound();
});

it('a vault identifier full of rubbish returns 404 and not a server error', function (): void {
    ($this->asAda)()
        ->getJson('/api/vaults/no-es-un-uuid/items')
        ->assertNotFound();
});
