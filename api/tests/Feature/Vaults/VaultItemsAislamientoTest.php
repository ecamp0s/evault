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
    $this->ada = User::factory()->conVaultPersonal()->create();
    $this->grace = User::factory()->conVaultPersonal()->create();

    $this->suyo = $this->ada->personalVault;
    $this->ajeno = $this->grace->personalVault;

    $this->token = $this->ada->createToken('api')->plainTextToken;
    $this->comoAda = fn () => $this->withHeader('Authorization', "Bearer {$this->token}");

    $this->payload = ['ciphertext' => 'blob', 'iv' => 'iv', 'version' => 1];
});

it('listar los items de un vault ajeno devuelve 404', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->ajeno->id]);

    ($this->comoAda)()
        ->getJson("/api/vaults/{$this->ajeno->id}/items")
        ->assertNotFound();
});

it('crear un item en un vault ajeno devuelve 404 y no escribe nada', function (): void {
    ($this->comoAda)()
        ->postJson("/api/vaults/{$this->ajeno->id}/items", $this->payload)
        ->assertNotFound();

    $this->assertDatabaseCount('vault_items', 0);
});

it('leer, actualizar y borrar un item ajeno devuelve 404 en los tres casos', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);
    $base = "/api/vaults/{$this->ajeno->id}/items/{$item->id}";

    ($this->comoAda)()->getJson($base)->assertNotFound();
    ($this->comoAda)()->patchJson($base, $this->payload)->assertNotFound();
    ($this->comoAda)()->deleteJson($base)->assertNotFound();

    // Y sigue ahí: un 404 no puede ser un borrado silencioso.
    $this->assertDatabaseHas('vault_items', ['id' => $item->id]);
});

/*
 * El caso más sutil, y el que un scoping mal escrito dejaría pasar: el vault de la
 * ruta es el propio, así que el middleware deja entrar, y el identificador del
 * item es real. Solo el acotado por vault_id dentro del servicio lo detiene.
 */
it('un item ajeno pedido desde el vault propio devuelve 404', function (): void {
    $ajeno = VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);
    $base = "/api/vaults/{$this->suyo->id}/items/{$ajeno->id}";

    ($this->comoAda)()->getJson($base)->assertNotFound();
    ($this->comoAda)()->patchJson($base, $this->payload)->assertNotFound();
    ($this->comoAda)()->deleteJson($base)->assertNotFound();

    $this->assertDatabaseHas('vault_items', ['id' => $ajeno->id]);
});

it('el listado del vault propio nunca incluye items de otro', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->suyo->id]);
    VaultItem::factory()->count(5)->create(['vault_id' => $this->ajeno->id]);

    $devueltos = ($this->comoAda)()
        ->getJson("/api/vaults/{$this->suyo->id}/items")
        ->assertOk()
        ->json('data.items');

    expect($devueltos)->toHaveCount(2);

    foreach ($devueltos as $item) {
        expect($item['vault_id'])->toBe($this->suyo->id);
    }
});

/*
 * La propiedad que hace que el 404 sirva de algo: un vault ajeno y uno inventado
 * tienen que responder exactamente lo mismo. Si se distinguieran, el 404 dejaría
 * de ocultar nada y valdría como oráculo de existencia.
 */
it('un vault ajeno y uno inexistente responden exactamente igual', function (): void {
    $inexistente = '019fbe85-0000-7000-8000-000000000000';

    $deAjeno = ($this->comoAda)()->getJson("/api/vaults/{$this->ajeno->id}/items");
    $deInexistente = ($this->comoAda)()->getJson("/api/vaults/{$inexistente}/items");

    expect($deAjeno->status())->toBe($deInexistente->status())
        ->and($deAjeno->json())->toBe($deInexistente->json());
});

it('un item ajeno y uno inexistente responden exactamente igual', function (): void {
    $ajeno = VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);
    $inexistente = '019fbe85-0000-7000-8000-000000000001';

    $deAjeno = ($this->comoAda)()->getJson("/api/vaults/{$this->suyo->id}/items/{$ajeno->id}");
    $deInexistente = ($this->comoAda)()->getJson("/api/vaults/{$this->suyo->id}/items/{$inexistente}");

    expect($deAjeno->status())->toBe($deInexistente->status())
        ->and($deAjeno->json())->toBe($deInexistente->json());
});

/*
 * Pertenecer a algún vault no da acceso a los demás. Hoy no existen las vaults
 * compartidas, pero el vault sin dueño personal ya es representable y conviene que
 * la regla esté fijada antes de que llegue el plan Team.
 */
it('pertenecer a un vault no da acceso a otro al que no se pertenece', function (): void {
    $compartido = Vault::factory()->create();
    VaultItem::factory()->create(['vault_id' => $compartido->id]);

    ($this->comoAda)()
        ->getJson("/api/vaults/{$compartido->id}/items")
        ->assertNotFound();
});

it('un identificador de vault con basura devuelve 404 y no un error del servidor', function (): void {
    ($this->comoAda)()
        ->getJson('/api/vaults/no-es-un-uuid/items')
        ->assertNotFound();
});
