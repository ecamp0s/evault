<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultItem;

/*
 * Aislamiento cross-tenant sobre los cinco endpoints. ADR-004 los declara
 * obligatorios: un servicio que toca datos de vault sin estos tests se considera
 * incompleto, y el fallo que previenen —una consulta sin vault_id devolviendo
 * datos de otro usuario— es el peor posible en este producto.
 *
 * La regla que atraviesa el archivo entero: siempre 404, nunca 403. Un 403
 * confirmaría que el identificador existe, y con eso se pueden enumerar vaults e
 * items ajenos sin llegar a leerlos.
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

it('listar los items de un vault ajeno devuelve 404', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->foreign->id]);

    ($this->asAda)()
        ->getJson("/api/vaults/{$this->foreign->id}/items")
        ->assertNotFound();
});

it('crear un item en un vault ajeno devuelve 404 y no escribe nada', function (): void {
    ($this->asAda)()
        ->postJson("/api/vaults/{$this->foreign->id}/items", $this->payload)
        ->assertNotFound();

    $this->assertDatabaseCount('vault_items', 0);
});

it('leer, actualizar y borrar un item ajeno devuelve 404 en los tres casos', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $base = "/api/vaults/{$this->foreign->id}/items/{$item->id}";

    ($this->asAda)()->getJson($base)->assertNotFound();
    ($this->asAda)()->patchJson($base, $this->payload)->assertNotFound();
    ($this->asAda)()->deleteJson($base)->assertNotFound();

    // Y sigue ahí: un 404 no puede ser un borrado silencioso.
    $this->assertDatabaseHas('vault_items', ['id' => $item->id]);
});

/*
 * El caso más sutil, y el que un scoping mal escrito dejaría pasar: el vault de la
 * ruta es el propio, así que el middleware deja entrar, y el identificador del
 * item es real. Solo el acotado por vault_id dentro del servicio lo detiene.
 */
it('un item ajeno pedido desde el vault propio devuelve 404', function (): void {
    $foreign = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $base = "/api/vaults/{$this->own->id}/items/{$foreign->id}";

    ($this->asAda)()->getJson($base)->assertNotFound();
    ($this->asAda)()->patchJson($base, $this->payload)->assertNotFound();
    ($this->asAda)()->deleteJson($base)->assertNotFound();

    $this->assertDatabaseHas('vault_items', ['id' => $foreign->id]);
});

it('el listado del vault propio nunca incluye items de otro', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->own->id]);
    VaultItem::factory()->count(5)->create(['vault_id' => $this->foreign->id]);

    $devueltos = ($this->asAda)()
        ->getJson("/api/vaults/{$this->own->id}/items")
        ->assertOk()
        ->json('data.items');

    expect($devueltos)->toHaveCount(2);

    foreach ($devueltos as $item) {
        expect($item['vault_id'])->toBe($this->own->id);
    }
});

/*
 * La propiedad que hace que el 404 sirva de algo: un vault ajeno y uno inventado
 * tienen que responder exactamente lo mismo. Si se distinguieran, el 404 dejaría
 * de ocultar nada y valdría como oráculo de existencia.
 */
it('un vault ajeno y uno inexistente responden exactamente igual', function (): void {
    $missing = '019fbe85-0000-7000-8000-000000000000';

    $fromForeign = ($this->asAda)()->getJson("/api/vaults/{$this->foreign->id}/items");
    $fromMissing = ($this->asAda)()->getJson("/api/vaults/{$missing}/items");

    expect($fromForeign->status())->toBe($fromMissing->status())
        ->and($fromForeign->json())->toBe($fromMissing->json());
});

it('un item ajeno y uno inexistente responden exactamente igual', function (): void {
    $foreign = VaultItem::factory()->create(['vault_id' => $this->foreign->id]);
    $missing = '019fbe85-0000-7000-8000-000000000001';

    $fromForeign = ($this->asAda)()->getJson("/api/vaults/{$this->own->id}/items/{$foreign->id}");
    $fromMissing = ($this->asAda)()->getJson("/api/vaults/{$this->own->id}/items/{$missing}");

    expect($fromForeign->status())->toBe($fromMissing->status())
        ->and($fromForeign->json())->toBe($fromMissing->json());
});

/*
 * Pertenecer a algún vault no da acceso a los demás. Hoy no existen las vaults
 * compartidas, pero el vault sin dueño personal ya es representable y conviene que
 * la regla esté fijada antes de que llegue el plan Team.
 */
it('pertenecer a un vault no da acceso a otro al que no se pertenece', function (): void {
    $compartido = Vault::factory()->create();
    VaultItem::factory()->create(['vault_id' => $compartido->id]);

    ($this->asAda)()
        ->getJson("/api/vaults/{$compartido->id}/items")
        ->assertNotFound();
});

it('un identificador de vault con basura devuelve 404 y no un error del servidor', function (): void {
    ($this->asAda)()
        ->getJson('/api/vaults/no-es-un-uuid/items')
        ->assertNotFound();
});
