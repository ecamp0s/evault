<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;

beforeEach(function (): void {
    $this->user = User::factory()->conVaultPersonal()->create();
    $this->vault = $this->user->personalVault;
    $this->token = $this->user->createToken('api')->plainTextToken;

    $this->comoUsuario = fn () => $this->withHeader('Authorization', "Bearer {$this->token}");

    $this->payload = [
        'ciphertext' => base64_encode(random_bytes(128)),
        'iv' => base64_encode(random_bytes(12)),
        'version' => 1,
    ];
});

it('crea un item y lo devuelve con su identificador', function (): void {
    $respuesta = ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", $this->payload);

    $respuesta->assertCreated()
        ->assertJsonPath('data.item.ciphertext', $this->payload['ciphertext'])
        ->assertJsonPath('data.item.iv', $this->payload['iv'])
        ->assertJsonPath('data.item.version', 1)
        ->assertJsonPath('data.item.vault_id', $this->vault->id);

    $this->assertDatabaseCount('vault_items', 1);
});

it('lista los items del vault', function (): void {
    VaultItem::factory()->count(3)->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items")
        ->assertOk()
        ->assertJsonCount(3, 'data.items');
});

it('devuelve una lista vacía cuando el vault no tiene nada', function (): void {
    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items")
        ->assertOk()
        ->assertJsonPath('data.items', []);
});

it('lee un item concreto', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items/{$item->id}")
        ->assertOk()
        ->assertJsonPath('data.item.id', $item->id)
        ->assertJsonPath('data.item.ciphertext', $item->ciphertext);
});

it('actualiza el payload completo de un item', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id, 'version' => 1]);

    $nuevo = [
        'ciphertext' => base64_encode(random_bytes(64)),
        'iv' => base64_encode(random_bytes(12)),
        'version' => 2,
    ];

    ($this->comoUsuario)()
        ->patchJson("/api/vaults/{$this->vault->id}/items/{$item->id}", $nuevo)
        ->assertOk()
        ->assertJsonPath('data.item.ciphertext', $nuevo['ciphertext'])
        ->assertJsonPath('data.item.version', 2);

    expect($item->fresh()?->ciphertext)->toBe($nuevo['ciphertext']);
});

it('borra un item', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->deleteJson("/api/vaults/{$this->vault->id}/items/{$item->id}")
        ->assertNoContent();

    $this->assertDatabaseCount('vault_items', 0);
});

/*
 * El ciclo entero contra la base de datos, encadenando las respuestas reales en
 * vez de montar el estado con factories. Es lo que comprueba que los cinco
 * endpoints encajan entre sí.
 */
it('completa el ciclo de creación, lectura, actualización y borrado', function (): void {
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
 * El blob vuelve exactamente como entró. Es el mismo criterio que #51 fijaba en la
 * tabla, comprobado ahora de punta a punta, que es donde puede romperlo una capa
 * intermedia.
 */
it('devuelve el blob byte a byte a través de la API', function (): void {
    $bytes = random_bytes(4096);
    $payload = ['ciphertext' => base64_encode($bytes), 'iv' => 'iv', 'version' => 1];

    $devuelto = ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", $payload)
        ->json('data.item.ciphertext');

    expect(base64_decode((string) $devuelto, true))->toBe($bytes);
});

it('expone solo los campos del contrato', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    $devuelto = ($this->comoUsuario)()
        ->getJson("/api/vaults/{$this->vault->id}/items/{$item->id}")
        ->json('data.item');

    expect(array_keys($devuelto))
        ->toBe(['id', 'vault_id', 'ciphertext', 'iv', 'version', 'created_at', 'updated_at']);
});

it('los cinco endpoints exigen autenticación', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $base = "/api/vaults/{$this->vault->id}/items";

    $this->getJson($base)->assertUnauthorized();
    $this->postJson($base, $this->payload)->assertUnauthorized();
    $this->getJson("{$base}/{$item->id}")->assertUnauthorized();
    $this->patchJson("{$base}/{$item->id}", $this->payload)->assertUnauthorized();
    $this->deleteJson("{$base}/{$item->id}")->assertUnauthorized();
});

it('exige los tres campos del payload', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['ciphertext', 'iv', 'version']);
});

it('rechaza una versión que no cabe en la columna', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [...$this->payload, 'version' => 70000])
        ->assertStatus(422)
        ->assertJsonValidationErrors('version');
});

/*
 * El servidor no opina sobre criptografía que no puede ejecutar. Una versión que
 * no conoce se guarda igual, porque un cliente más nuevo tiene que poder escribir
 * un esquema posterior. Ver docs/architecture/FOUNDATION.md.
 */
it('acepta una versión de esquema que el servidor no conoce', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [...$this->payload, 'version' => 99])
        ->assertCreated()
        ->assertJsonPath('data.item.version', 99);
});

it('no exige que el blob sea base64 ni tenga ninguna forma concreta', function (): void {
    ($this->comoUsuario)()
        ->postJson("/api/vaults/{$this->vault->id}/items", [
            'ciphertext' => 'esto no es base64 !!! ñ 漢字',
            'iv' => 'tampoco',
            'version' => 1,
        ])
        ->assertCreated()
        ->assertJsonPath('data.item.ciphertext', 'esto no es base64 !!! ñ 漢字');
});

it('el PATCH sustituye el payload entero y no admite campos sueltos', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);

    ($this->comoUsuario)()
        ->patchJson("/api/vaults/{$this->vault->id}/items/{$item->id}", ['ciphertext' => 'solo-esto'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['iv', 'version']);
});
