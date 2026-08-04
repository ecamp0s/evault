<?php

declare(strict_types=1);

use App\Application\Vaults\ListUserVaults;
use App\Application\Vaults\VaultSummary;
use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;

it('devuelve el vault personal con su rol', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $vaults = app(ListUserVaults::class)->handle($user->id);

    expect($vaults)->toHaveCount(1);

    $summary = $vaults->first();

    expect($summary)->toBeInstanceOf(VaultSummary::class)
        ->and($summary?->id)->toBe($user->personalVault?->id)
        ->and($summary?->isPersonal)->toBeTrue()
        ->and($summary?->role)->toBe(VaultRole::Owner);
});

it('devuelve la clave envuelta del vault', function (): void {
    $user = User::factory()
        ->withPersonalVault(wrappedKey('la-clave-envuelta', 'el-nonce'))
        ->create();

    $summary = app(ListUserVaults::class)->handle($user->id)->first();

    expect($summary?->wrappedKey->ciphertext)->toBe('la-clave-envuelta')
        ->and($summary?->wrappedKey->iv)->toBe('el-nonce');
});

/*
 * Aislamiento cross-tenant sobre el dato nuevo, en la capa de aplicación y como
 * exige ADR-004. Importa más que el resto: la clave envuelta de otra persona es lo
 * único que le falta a quien ya conozca su contraseña maestra.
 *
 * El caso está montado sobre un vault compartido a propósito, que es donde el fallo
 * podría aparecer de verdad: dos miembros del mismo vault con envolturas distintas
 * de la misma clave. Hoy no se pueden crear por API, pero el modelo ya lo admite y
 * conviene fijar el comportamiento antes de que llegue el plan Team.
 */
it('devuelve la clave envuelta de quien pregunta y no la de otro miembro', function (): void {
    $ada = User::factory()->create();
    $grace = User::factory()->create();

    $compartido = Vault::factory()->create(['name' => 'Equipo']);
    $compartido->members()->attach($ada->id, [
        'role' => VaultRole::Owner->value,
        'wrapped_key' => 'la-de-ada',
        'wrapped_key_iv' => 'nonce-ada',
    ]);
    $compartido->members()->attach($grace->id, [
        'role' => VaultRole::Owner->value,
        'wrapped_key' => 'la-de-grace',
        'wrapped_key_iv' => 'nonce-grace',
    ]);

    $deAda = app(ListUserVaults::class)->handle($ada->id)->first();
    $deGrace = app(ListUserVaults::class)->handle($grace->id)->first();

    expect($deAda?->id)->toBe($deGrace?->id)
        ->and($deAda?->wrappedKey->ciphertext)->toBe('la-de-ada')
        ->and($deGrace?->wrappedKey->ciphertext)->toBe('la-de-grace');
});

/*
 * Aislamiento en la capa de aplicación, llamando al servicio directamente. Es la
 * garantía de que el endpoint no depende de que nadie filtre por fuera.
 */
it('no devuelve vaults de otros usuarios', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    $vaults = app(ListUserVaults::class)->handle($ada->id);

    expect($vaults->pluck('id')->all())->toBe([$ada->personalVault?->id])
        ->and($vaults->pluck('id'))->not->toContain($grace->personalVault?->id);
});

it('no devuelve un vault del que no se es miembro aunque no sea de nadie', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    Vault::factory()->create();

    expect(app(ListUserVaults::class)->handle($user->id))->toHaveCount(1);
});

it('marca como no personal un vault del que solo se es miembro', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $compartido = Vault::factory()->create(['name' => 'Equipo']);
    $compartido->members()->attach($user->id, membership());

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
            ->members()->attach($user->id, membership());
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
