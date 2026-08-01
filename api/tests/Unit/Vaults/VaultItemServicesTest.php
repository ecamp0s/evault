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
 * Segunda barrera del double guard. Estos tests llaman a los servicios
 * directamente, saltándose el middleware y el controlador enteros, que es la única
 * forma de comprobar que la capa de aplicación se defiende sola.
 *
 * Si algún día alguien monta un comando de consola, un job en cola o un endpoint
 * nuevo que llame a estos servicios sin pasar por el middleware, esto es lo que
 * garantiza que no se convierta en una fuga.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->conVaultPersonal()->create();
    $this->grace = User::factory()->conVaultPersonal()->create();

    $this->suyo = $this->ada->personalVault;
    $this->ajeno = $this->grace->personalVault;

    $this->payload = new VaultItemPayload('blob', 'iv', 1);
});

it('listar rechaza un vault del que no se es miembro', function (): void {
    VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);

    expect(fn () => app(ListVaultItems::class)->handle($this->ada->id, $this->ajeno->id))
        ->toThrow(VaultNotAccessible::class);
});

it('crear rechaza un vault del que no se es miembro y no escribe nada', function (): void {
    expect(fn () => app(CreateVaultItem::class)->handle($this->ada->id, $this->ajeno->id, $this->payload))
        ->toThrow(VaultNotAccessible::class);

    $this->assertDatabaseCount('vault_items', 0);
});

it('leer rechaza un vault del que no se es miembro', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);

    expect(fn () => app(ShowVaultItem::class)->handle($this->ada->id, $this->ajeno->id, $item->id))
        ->toThrow(VaultNotAccessible::class);
});

it('actualizar rechaza un vault del que no se es miembro y no toca la fila', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->ajeno->id, 'ciphertext' => 'original']);

    expect(fn () => app(UpdateVaultItem::class)->handle($this->ada->id, $this->ajeno->id, $item->id, $this->payload))
        ->toThrow(VaultNotAccessible::class);

    expect($item->fresh()?->ciphertext)->toBe('original');
});

it('borrar rechaza un vault del que no se es miembro y no borra nada', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);

    expect(fn () => app(DeleteVaultItem::class)->handle($this->ada->id, $this->ajeno->id, $item->id))
        ->toThrow(VaultNotAccessible::class);

    $this->assertDatabaseHas('vault_items', ['id' => $item->id]);
});

/*
 * Vault propio, item real, pero de otro vault. Es el caso que solo detiene el
 * acotado por vault_id dentro del servicio, no la comprobación de pertenencia.
 */
it('un item de otro vault no se alcanza desde el vault propio', function (): void {
    $ajeno = VaultItem::factory()->create(['vault_id' => $this->ajeno->id]);

    expect(fn () => app(ShowVaultItem::class)->handle($this->ada->id, $this->suyo->id, $ajeno->id))
        ->toThrow(VaultItemNotFound::class);

    expect(fn () => app(UpdateVaultItem::class)->handle($this->ada->id, $this->suyo->id, $ajeno->id, $this->payload))
        ->toThrow(VaultItemNotFound::class);

    expect(fn () => app(DeleteVaultItem::class)->handle($this->ada->id, $this->suyo->id, $ajeno->id))
        ->toThrow(VaultItemNotFound::class);

    $this->assertDatabaseHas('vault_items', ['id' => $ajeno->id]);
});

it('listar devuelve solo los items del vault pedido', function (): void {
    VaultItem::factory()->count(2)->create(['vault_id' => $this->suyo->id]);
    VaultItem::factory()->count(3)->create(['vault_id' => $this->ajeno->id]);

    $items = app(ListVaultItems::class)->handle($this->ada->id, $this->suyo->id);

    expect($items)->toHaveCount(2)
        ->and($items->pluck('vault_id')->unique()->all())->toBe([$this->suyo->id]);
});

it('crear guarda el payload tal cual', function (): void {
    $item = app(CreateVaultItem::class)->handle(
        $this->ada->id,
        $this->suyo->id,
        new VaultItemPayload('un-blob-opaco', 'un-nonce', 7),
    );

    expect($item->ciphertext)->toBe('un-blob-opaco')
        ->and($item->iv)->toBe('un-nonce')
        ->and($item->version)->toBe(7)
        ->and($item->vault_id)->toBe($this->suyo->id);
});

it('actualizar sustituye los tres campos a la vez', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->suyo->id]);

    $actualizado = app(UpdateVaultItem::class)->handle(
        $this->ada->id,
        $this->suyo->id,
        $item->id,
        new VaultItemPayload('nuevo', 'nuevo-iv', 2),
    );

    expect($actualizado->ciphertext)->toBe('nuevo')
        ->and($actualizado->iv)->toBe('nuevo-iv')
        ->and($actualizado->version)->toBe(2)
        ->and($actualizado->id)->toBe($item->id);
});

it('borrar quita la fila', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->suyo->id]);

    app(DeleteVaultItem::class)->handle($this->ada->id, $this->suyo->id, $item->id);

    $this->assertDatabaseCount('vault_items', 0);
});

it('un item que no existe en ninguna parte también da VaultItemNotFound', function (): void {
    expect(fn () => app(ShowVaultItem::class)->handle(
        $this->ada->id,
        $this->suyo->id,
        '019fbe85-0000-7000-8000-000000000000',
    ))->toThrow(VaultItemNotFound::class);
});
