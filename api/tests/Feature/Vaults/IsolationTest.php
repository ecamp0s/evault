<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;

/*
 * Cross-tenant isolation over the vaults model. ADR-004 demands it in every service
 * that touches vault data, and here there are no endpoints yet — #52 brings them — so
 * what is checked is that the relation does not let anybody see what is not theirs.
 *
 * These tests are the floor the CRUD ones stand on. If any of them fails, no test of
 * the endpoints means anything.
 */

it('each user sees only their own vault', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    expect($ada->vaults->pluck('id')->all())->toBe([$ada->personalVault?->id])
        ->and($grace->vaults->pluck('id')->all())->toBe([$grace->personalVault?->id])
        ->and($ada->vaults->pluck('id'))->not->toContain($grace->personalVault?->id);

    $this->assertDatabaseCount('vaults', 2);
});

it('somebody else\'s vault does not turn up by asking from one\'s own user', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    $foreign = $ada->vaults()->whereKey($grace->personalVault?->id)->first();

    expect($foreign)->toBeNull();
});

it('a vault shared with nobody else has no other members', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    User::factory()->withPersonalVault()->create();

    expect($ada->personalVault?->members)->toHaveCount(1);
});

/*
 * Membership is not inherited from the vault: belonging to one gives no access to the
 * rest, not even to those that are nobody's personal one.
 */
it('a vault with no personal owner is not visible to a non-member either', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $orphan = Vault::factory()->create();

    expect($ada->vaults->pluck('id'))->not->toContain($orphan->id);
});
