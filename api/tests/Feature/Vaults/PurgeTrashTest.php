<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Support\Carbon;

/*
 * The purge of the bin (ADR-018 §2.4, #708). The days are written as numbers and not
 * against Trash::RETENTION_DAYS, so that moving the thirty breaks these tests
 * (ADR-018 §4, the lesson of the Iteration 13 threshold).
 */

beforeEach(function (): void {
    Carbon::setTestNow('2026-10-31 03:00:00');
    $this->vault = User::factory()->withPersonalVault()->create()->personalVault;
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/** An item of the vault, deleted that many days before now. */
function binnedDaysAgo(string $vaultId, float $days): VaultItem
{
    $item = VaultItem::factory()->create(['vault_id' => $vaultId]);
    $item->forceFill(['deleted_at' => now()->subMinutes((int) round($days * 24 * 60))])->save();

    return $item;
}

it('purges what has had its thirty days and keeps what has not', function (): void {
    $due = binnedDaysAgo($this->vault->id, 31);
    $exactly = binnedDaysAgo($this->vault->id, 30);
    $notYet = binnedDaysAgo($this->vault->id, 29.9);

    $this->artisan('evault:purge-trash')->assertSuccessful();

    $this->assertDatabaseMissing('vault_items', ['id' => $due->id]);
    $this->assertDatabaseMissing('vault_items', ['id' => $exactly->id]);
    $this->assertSoftDeleted('vault_items', ['id' => $notYet->id]);
});

it('never touches a live entry, however old', function (): void {
    $old = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $old->forceFill(['created_at' => now()->subYear(), 'updated_at' => now()->subYear()])->save();

    $this->artisan('evault:purge-trash')->assertSuccessful();

    $this->assertNotSoftDeleted('vault_items', ['id' => $old->id]);
});

it('catches up after days without running, in one go', function (): void {
    $items = collect([45, 38, 33, 31])->map(fn (int $days) => binnedDaysAgo($this->vault->id, $days));

    $this->artisan('evault:purge-trash')
        ->expectsOutputToContain('Purgadas 4 entradas')
        ->assertSuccessful();

    foreach ($items as $item) {
        $this->assertDatabaseMissing('vault_items', ['id' => $item->id]);
    }
});

it('purges in every vault of the instance', function (): void {
    $other = User::factory()->withPersonalVault()->create()->personalVault;
    $mine = binnedDaysAgo($this->vault->id, 31);
    $theirs = binnedDaysAgo($other->id, 31);

    $this->artisan('evault:purge-trash')->assertSuccessful();

    $this->assertDatabaseMissing('vault_items', ['id' => $mine->id]);
    $this->assertDatabaseMissing('vault_items', ['id' => $theirs->id]);
});

it('run twice, the second purges nothing', function (): void {
    binnedDaysAgo($this->vault->id, 31);

    $this->artisan('evault:purge-trash')->expectsOutputToContain('Purgadas 1 entradas')->assertSuccessful();
    $this->artisan('evault:purge-trash')->expectsOutputToContain('Purgadas 0 entradas')->assertSuccessful();
});

it('says the cutoff it used, so that a wrong clock shows in the log', function (): void {
    $this->artisan('evault:purge-trash')
        ->expectsOutputToContain('hasta el 2026-10-01T03:00:00')
        ->assertSuccessful();
});

it('with --dry-run says how many and deletes none', function (): void {
    $due = binnedDaysAgo($this->vault->id, 31);

    $this->artisan('evault:purge-trash', ['--dry-run' => true])
        ->expectsOutputToContain('Se purgarían 1 entradas')
        ->assertSuccessful();

    $this->assertSoftDeleted('vault_items', ['id' => $due->id]);
});

/*
 * What the bin announces and what the purge does come from the same place: an entry
 * is gone at the purges_at the API gave for it, and not a minute before.
 */
it('purges an entry exactly at the purges_at the bin announced for it', function (): void {
    $item = VaultItem::factory()->create(['vault_id' => $this->vault->id]);
    $item->delete();
    $user = $this->vault->members()->first();
    $token = $user->createToken('web')->plainTextToken;
    $announced = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson("/api/vaults/{$this->vault->id}/trash")->json('data.items.0.purges_at');

    Carbon::setTestNow(Carbon::parse($announced)->subMinute());
    $this->artisan('evault:purge-trash')->assertSuccessful();
    $this->assertSoftDeleted('vault_items', ['id' => $item->id]);

    Carbon::setTestNow(Carbon::parse($announced));
    $this->artisan('evault:purge-trash')->assertSuccessful();
    $this->assertDatabaseMissing('vault_items', ['id' => $item->id]);
});
