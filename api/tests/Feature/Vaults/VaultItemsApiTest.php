<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create();
    $this->vault = $this->user->personalVault;
    $this->token = $this->user->createToken('api')->plainTextToken;

    $this->comoUsuario = fn () => $this->withHeader('Authorization', "Bearer {$this->token}");

    $this->payload = [
        'ciphertext' => base64_encode(random_bytes(128)),
        'iv' => base64_encode(random_bytes(12)),
        'version' => 1,
    ];
});

it('creates an item and returns it with its identifier', function (): void {
    $response = ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", $this->payload);

    $response->assertCreated()
        ->assertJsonPath('data.item.ciphertext', $this->payload['ciphertext'])
        ->assertJsonPath('data.item.iv', $this->payload['iv'])
        ->assertJsonPath('data.item.version', 1)
        ->assertJsonPath('data.item.vault_id', $this->vault->id);

    $this->assertDatabaseCount('vault_items', 1);
});

it('lists the vault\'s items', function (): void {
    VaultItem::factory()->count(3)->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items")
        ->assertOk()
        ->assertJsonCount(3, 'data.items');
});

it('returns an empty list when the vault holds nothing', function (): void {
    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items")
        ->assertOk()
        ->assertJsonPath('data.items', []);
});

it('reads one particular item', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.item.id', $item->id)
        ->assertJsonPath('data.item.ciphertext', $item->ciphertext);
});

it('updates an item\'s whole payload', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id, 'version' => 1]);

    $created = [
        'ciphertext' => base64_encode(random_bytes(64)),
        'iv' => base64_encode(random_bytes(12)),
        'version' => 2,
    ];

    ($this->comoUsuario)()
        ->patchJson("/api/vaults/{$this->vault->id}/items/{$item->id}", $created)
        ->assertOk()
        ->assertJsonPath('data.item.ciphertext', $created['ciphertext'])
        ->assertJsonPath('data.item.version', 2);

    expect($item->fresh()?->ciphertext)->toBe($created['ciphertext']);
});

it('deletes an item', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->deleteJson("/api/vaults/{$this->vault->id}/items/{$item->id}")
        ->assertNoContent();

    $this->assertDatabaseCount('vault_items', 0);
});

/*
 * The whole cycle against the database, chaining the real responses instead of setting
 * up the state with factories. It is what checks that the five endpoints fit together.
 */
it('completes the cycle of create, read, update and delete', function (): void {
    $id = ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", $this->payload)
        ->assertCreated()
        ->json('data.item.id');

    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items/{$id}")
        ->assertOk();

    ($this->comoUsuario)()
        ->patchJson("/api/vaults/{$this->vault->id}/items/{$id}", [
            'ciphertext' => 'otro-blob',
            'iv' => 'otro-iv',
            'version' => 1,
        ])->assertOk()->assertJsonPath('data.item.ciphertext', 'otro-blob');

    ($this->comoUsuario)()
        ->deleteJson("/api/vaults/{$this->vault->id}/items/{$id}")
        ->assertNoContent();

    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items/{$id}")
        ->assertNotFound();
});

/*
 * The blob comes back exactly as it went in. It is the same criterion #51 pinned at the
 * table, checked now end to end, which is where an intermediate layer could break it.
 */
it('returns the blob byte for byte through the API', function (): void {
    $bytes = random_bytes(4096);
    $payload = ['ciphertext' => base64_encode($bytes), 'iv' => 'iv', 'version' => 1];

    $returned = ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", $payload)
        ->json('data.item.ciphertext');

    expect(base64_decode((string) $returned, true))->toBe($bytes);
});

it('exposes only the fields of the contract', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    $returned = ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items/{$item->id}")
        ->json('data.item');

    expect(array_keys($returned))
        ->toBe(['id', 'vault_id', 'ciphertext', 'iv', 'version', 'created_at', 'updated_at']);
});

it('all five endpoints demand authentication', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $base = "/api/vaults/{$this->vault->id}/items";

    $this->getJson($base)->assertUnauthorized();
    $this->postJson($base, $this->payload)->assertUnauthorized();
    $this->getJson("{$base}/{$item->id}")->assertUnauthorized();
    $this->patchJson("{$base}/{$item->id}", $this->payload)->assertUnauthorized();
    $this->deleteJson("{$base}/{$item->id}")->assertUnauthorized();
});

it('demands all three fields of the payload', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['ciphertext', 'iv', 'version']);
});

it('refuses a version that does not fit the column', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [...$this->payload, 'version' => 70000])
        ->assertStatus(422)
        ->assertJsonValidationErrors('version');
});

/*
 * The server does not opine on cryptography it cannot run. A version it does not know
 * is stored all the same, because a newer client has to be able to write a later
 * schema. See docs/architecture/FOUNDATION.md.
 */
it('accepts a schema version the server does not know', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [...$this->payload, 'version' => 99])
        ->assertCreated()
        ->assertJsonPath('data.item.version', 99);
});

it('does not demand the blob be base64 or take any particular shape', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [
            'ciphertext' => 'esto no es base64 !!! ñ 漢字',
            'iv' => 'tampoco',
            'version' => 1,
        ])
        ->assertCreated()
        ->assertJsonPath('data.item.ciphertext', 'esto no es base64 !!! ñ 漢字');
});

it('the PATCH replaces the whole payload and admits no loose fields', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->patchJson("/api/vaults/{$this->vault->id}/items/{$item->id}", ['ciphertext' => 'solo-esto'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['iv', 'version']);
});
