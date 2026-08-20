<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultItem;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

/*
 * This is the test that defends the blob's contract. If it ever fails because somebody
 * added a column, the question to ask is not how to update it, but whether that datum
 * may sit in the clear on the server.
 *
 * The list is exhaustive and ordered like the migration. See ADR-001 and
 * docs/architecture/FOUNDATION.md.
 */
it('has no column that means anything to the user', function (): void {
    expect(Schema::getColumnListing('vault_items'))->toBe([
        'id',
        'vault_id',
        'ciphertext',
        'iv',
        'version',
        'created_at',
        'updated_at',
    ]);
});

/*
 * The issue's central criterion: the server stores and returns exactly what it was
 * given. It is tested with genuinely random bytes and not with text, because what can
 * break is precisely what is not readable text.
 */
it('returns the blob byte for byte, without interpreting it', function (): void {
    $bytes = random_bytes(2048);
    $payload = base64_encode($bytes);

    $item = VaultItem::factory()->create(['ciphertext' => $payload]);

    $recovered = VaultItem::query()->whereKey($item->id)->sole();

    expect($recovered->ciphertext)->toBe($payload)
        ->and(base64_decode($recovered->ciphertext, true))->toBe($bytes);
});

/*
 * A blob that resembles something else. The real risk is not that somebody decides to
 * interpret the content on purpose, but that an intermediate layer does it on its own
 * for recognising a familiar shape.
 */
it('does not interpret a blob that looks like JSON or anything else known', function (): void {
    $suspicious = [
        '{"name":"esto no es un objeto","password":"tampoco"}',
        '<?php echo "hola"; ?>',
        "con\0bytes\nnulos\ty saltos",
        'ÁÉÍÓÚ ñ 漢字 🔐',
        '',
    ];

    foreach ($suspicious as $payload) {
        $item = VaultItem::factory()->create(['ciphertext' => $payload]);

        expect($item->fresh()?->ciphertext)->toBe($payload);
    }
});

it('takes a large blob without truncating it', function (): void {
    // Past the 64 kB where a text column would stop, which is why the column is
    // longText.
    $payload = base64_encode(random_bytes(96 * 1024));

    $item = VaultItem::factory()->create(['ciphertext' => $payload]);

    expect($item->fresh()?->ciphertext)->toBe($payload);
});

it('an item cannot be created with no vault', function (): void {
    expect(fn () => VaultItem::factory()->create(['vault_id' => null]))
        ->toThrow(QueryException::class);
});

it('an item cannot be created in a vault that does not exist', function (): void {
    expect(fn () => VaultItem::factory()->create([
        'vault_id' => '019fbe85-0000-7000-8000-000000000000',
    ]))->toThrow(QueryException::class);
});

it('deleting the vault takes its items with it', function (): void {
    $vault = Vault::factory()->create();
    VaultItem::factory()->count(3)->create(['vault_id' => $vault->id]);

    $this->assertDatabaseCount('vault_items', 3);

    $vault->delete();

    $this->assertDatabaseCount('vault_items', 0);
});

/*
 * The full cascade: deleting the account takes the personal vault and, with it,
 * everything inside. It is what keeps removing a user from leaving orphaned secrets in
 * the database.
 */
it('deleting the user takes the items of their personal vault', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    VaultItem::factory()->count(2)->create(['vault_id' => $user->personalVault?->id]);

    $user->delete();

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_items', 0);
});

it('stores the schema version as it stands, without validating it', function (): void {
    // A version this server does not know. It has to take it all the same: a newer
    // client must be able to write a schema the server does not run.
    $item = VaultItem::factory()->create(['version' => 99]);

    expect($item->fresh()?->version)->toBe(99);
});

it('the identifier is a uuid and not an integer', function (): void {
    $item = VaultItem::factory()->create();

    expect($item->id)->toBeString()
        ->and(Str::isUuid($item->id))->toBeTrue();
});

it('the items belong to the vault and are reached from it', function (): void {
    $vault = Vault::factory()->create();
    $other = Vault::factory()->create();

    $item = VaultItem::factory()->create(['vault_id' => $vault->id]);
    VaultItem::factory()->count(2)->create(['vault_id' => $other->id]);

    expect($vault->items)->toHaveCount(1)
        ->and($vault->items->first()?->id)->toBe($item->id)
        ->and($item->vault->id)->toBe($vault->id);
});
