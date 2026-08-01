<?php

declare(strict_types=1);

use App\Application\Vaults\ListUserVaults;
use App\Application\Vaults\VaultSummary;
use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;

it('devuelve el vault personal con su rol', function (): void {
    $user = User::factory()->conVaultPersonal()->create();

    $vaults = app(ListUserVaults::class)->handle($user->id);

    expect($vaults)->toHaveCount(1);

    $summary = $vaults->first();

    expect($summary)->toBeInstanceOf(VaultSummary::class)
        ->and($summary?->id)->toBe($user->personalVault?->id)
        ->and($summary?->isPersonal)->toBeTrue()
        ->and($summary?->role)->toBe(VaultRole::Owner);
});

/*
 * Aislamiento en la capa de aplicación, llamando al servicio directamente. Es la
 * garantía de que el endpoint no depende de que nadie filtre por fuera.
 */
it('no devuelve vaults de otros usuarios', function (): void {
    $ada = User::factory()->conVaultPersonal()->create();
    $grace = User::factory()->conVaultPersonal()->create();

    $vaults = app(ListUserVaults::class)->handle($ada->id);

    expect($vaults->pluck('id')->all())->toBe([$ada->personalVault?->id])
        ->and($vaults->pluck('id'))->not->toContain($grace->personalVault?->id);
});

it('no devuelve un vault del que no se es miembro aunque no sea de nadie', function (): void {
    $user = User::factory()->conVaultPersonal()->create();
    Vault::factory()->create();

    expect(app(ListUserVaults::class)->handle($user->id))->toHaveCount(1);
});

it('marca como no personal un vault del que solo se es miembro', function (): void {
    $user = User::factory()->conVaultPersonal()->create();
    $compartido = Vault::factory()->create(['name' => 'Equipo']);
    $compartido->members()->attach($user->id, ['role' => VaultRole::Owner->value]);

    $vaults = app(ListUserVaults::class)->handle($user->id);

    $porNombre = $vaults->keyBy('name');

    expect($vaults)->toHaveCount(2)
        ->and($porNombre->get('Equipo')?->isPersonal)->toBeFalse()
        ->and($porNombre->get('Personal')?->isPersonal)->toBeTrue();
});

it('ordena por nombre para que la respuesta sea estable', function (): void {
    $user = User::factory()->create();

    foreach (['Zeta', 'Alfa', 'Media'] as $nombre) {
        Vault::factory()->create(['name' => $nombre])
            ->members()->attach($user->id, ['role' => VaultRole::Owner->value]);
    }

    $vaults = app(ListUserVaults::class)->handle($user->id);

    expect($vaults->pluck('name')->all())->toBe(['Alfa', 'Media', 'Zeta']);
});

/*
 * No debería ocurrir, porque quien llama viene autenticado. Se comprueba que
 * devuelve vacío y no que revienta: convertir una situación imposible en un 500
 * solo empeoraría el diagnóstico.
 */
it('devuelve una lista vacía para un usuario que no existe', function (): void {
    expect(app(ListUserVaults::class)->handle(99999))->toBeEmpty();
});

it('devuelve una lista vacía para un usuario sin vaults', function (): void {
    $user = User::factory()->create();

    expect(app(ListUserVaults::class)->handle($user->id))->toBeEmpty();
});
