<?php

declare(strict_types=1);

use App\Application\Vaults\ListUserVaults;
use App\Application\Vaults\VaultSummary;
use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;

it('returns the personal vault with its role', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $vaults = app(ListUserVaults::class)->handle($user->id);

    expect($vaults)->toHaveCount(1);

    $summary = $vaults->first();

    expect($summary)->toBeInstanceOf(VaultSummary::class)
        ->and($summary?->id)->toBe($user->personalVault?->id)
        ->and($summary?->isPersonal)->toBeTrue()
        ->and($summary?->role)->toBe(VaultRole::Owner);
});

it('returns the vault\'s wrapped key', function (): void {
    $user = User::factory()
        ->withPersonalVault(wrappedKey('la-clave-envuelta', 'el-nonce'))
        ->create();

    $summary = app(ListUserVaults::class)->handle($user->id)->first();

    expect($summary?->wrappedKey->ciphertext)->toBe('la-clave-envuelta')
        ->and($summary?->wrappedKey->iv)->toBe('el-nonce');
});

/*
 * Cross-tenant isolation over the new datum, in the application layer and as ADR-004
 * demands. It matters more than the rest: somebody else's wrapped key is the only thing
 * missing for whoever already knows their master password.
 *
 * The case is built on a shared vault on purpose, which is where the failure could
 * really appear: two members of the same vault with different wrappings of the same
 * key. They cannot be created through the API today, but the model already admits it
 * and it is worth pinning the behaviour before shared vaults arrive.
 */
it('returns the wrapped key of whoever is asking and not another member\'s', function (): void {
    $ada = User::factory()->create();
    $grace = User::factory()->create();

    $shared = Vault::factory()->create(['name' => 'Equipo']);
    $shared->members()->attach($ada->id, [
        'role' => VaultRole::Owner->value,
        'wrapped_key' => 'la-de-ada',
        'wrapped_key_iv' => 'nonce-ada',
    ]);
    $shared->members()->attach($grace->id, [
        'role' => VaultRole::Owner->value,
        'wrapped_key' => 'la-de-grace',
        'wrapped_key_iv' => 'nonce-grace',
    ]);

    $adaVault = app(ListUserVaults::class)->handle($ada->id)->first();
    $graceVault = app(ListUserVaults::class)->handle($grace->id)->first();

    expect($adaVault?->id)->toBe($graceVault?->id)
        ->and($adaVault?->wrappedKey->ciphertext)->toBe('la-de-ada')
        ->and($graceVault?->wrappedKey->ciphertext)->toBe('la-de-grace');
});

/*
 * Isolation in the application layer, calling the service directly. It is the guarantee
 * that the endpoint does not depend on anybody filtering from outside.
 */
it('does not return other users\' vaults', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    $vaults = app(ListUserVaults::class)->handle($ada->id);

    expect($vaults->pluck('id')->all())->toBe([$ada->personalVault?->id])
        ->and($vaults->pluck('id'))->not->toContain($grace->personalVault?->id);
});

it('does not return a vault one is not a member of even when it is nobody\'s', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    Vault::factory()->create();

    expect(app(ListUserVaults::class)->handle($user->id))->toHaveCount(1);
});

it('marks as not personal a vault one is merely a member of', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $shared = Vault::factory()->create(['name' => 'Equipo']);
    $shared->members()->attach($user->id, membership());

    $vaults = app(ListUserVaults::class)->handle($user->id);

    $byName = $vaults->keyBy('name');

    expect($vaults)->toHaveCount(2)
        ->and($byName->get('Equipo')?->isPersonal)->toBeFalse()
        ->and($byName->get('Personal')?->isPersonal)->toBeTrue();
});

it('orders by name so that the response is stable', function (): void {
    $user = User::factory()->create();

    foreach (['Zeta', 'Alfa', 'Media'] as $name) {
        Vault::factory()->create(['name' => $name])
            ->members()->attach($user->id, membership());
    }

    $vaults = app(ListUserVaults::class)->handle($user->id);

    expect($vaults->pluck('name')->all())->toBe(['Alfa', 'Media', 'Zeta']);
});

/*
 * It should not happen, because the caller arrives authenticated. What is checked is
 * that it returns empty and not that it blows up: turning an impossible situation into
 * a 500 would only make the diagnosis worse.
 */
it('returns an empty list for a user that does not exist', function (): void {
    expect(app(ListUserVaults::class)->handle(99999))->toBeEmpty();
});

it('returns an empty list for a user with no vaults', function (): void {
    $user = User::factory()->create();

    expect(app(ListUserVaults::class)->handle($user->id))->toBeEmpty();
});
