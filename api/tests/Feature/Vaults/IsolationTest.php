<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;

/*
 * Aislamiento cross-tenant sobre el modelo de vaults. ADR-004 los exige en todos
 * los servicios que tocan datos de vault, y aquí todavía no hay endpoints —los
 * trae #52—, así que lo que se comprueba es que la relación no deja ver lo ajeno.
 *
 * Estos tests son el suelo del que parten los del CRUD. Si alguno de ellos falla,
 * ningún test de los endpoints significa nada.
 */

it('cada usuario solo ve su propio vault', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    expect($ada->vaults->pluck('id')->all())->toBe([$ada->personalVault?->id])
        ->and($grace->vaults->pluck('id')->all())->toBe([$grace->personalVault?->id])
        ->and($ada->vaults->pluck('id'))->not->toContain($grace->personalVault?->id);

    $this->assertDatabaseCount('vaults', 2);
});

it('el vault de otro no aparece por pedirlo desde el usuario propio', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    $foreign = $ada->vaults()->whereKey($grace->personalVault?->id)->first();

    expect($foreign)->toBeNull();
});

it('un vault compartido con nadie más no tiene otros miembros', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    User::factory()->withPersonalVault()->create();

    expect($ada->personalVault?->members)->toHaveCount(1);
});

/*
 * La pertenencia no se hereda del vault: pertenecer a uno no da acceso al resto,
 * ni siquiera a los que no son personales de nadie.
 */
it('un vault sin dueño personal tampoco es visible para quien no es miembro', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $huerfano = Vault::factory()->create();

    expect($ada->vaults->pluck('id'))->not->toContain($huerfano->id);
});
