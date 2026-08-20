<?php

declare(strict_types=1);

use App\Application\Vaults\CreatePersonalVault;
use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;
use Illuminate\Database\QueryException;

it('creates the personal vault and the membership as its owner', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle($user->id, wrappedKey());

    expect($vault->personal_for_user_id)->toBe($user->id)
        ->and($vault->isPersonal())->toBeTrue()
        ->and($vault->members)->toHaveCount(1)
        ->and($vault->members->first()?->id)->toBe($user->id);

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault->id,
        'user_id' => $user->id,
        'role' => VaultRole::Owner->value,
    ]);
});

it('stores the wrapped key it receives', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle(
        $user->id,
        wrappedKey('la-clave-envuelta', 'el-nonce'),
    );

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault->id,
        'user_id' => $user->id,
        'wrapped_key' => 'la-clave-envuelta',
        'wrapped_key_iv' => 'el-nonce',
    ]);
});

/*
 * The dangerous face of idempotence. The service also exists to repair a user who had
 * ended up without a vault, so it can be called on one that already has it; if in that
 * case it overwrote the wrapped key, that vault's items would be left encrypted under a
 * key nobody holds any more, and that is not undone even with the right password.
 *
 * Re-wrapping the existing key is another operation — the master password change — and
 * it needs the old key to be done properly.
 */
it('does not overwrite the wrapped key of a vault that already exists', function (): void {
    $user = User::factory()->create();
    $service = new CreatePersonalVault;

    $service->handle($user->id, wrappedKey('la-buena', 'nonce-bueno'));
    $service->handle($user->id, wrappedKey('la-que-llega-despues', 'otro-nonce'));

    $this->assertDatabaseHas('vault_members', [
        'user_id' => $user->id,
        'wrapped_key' => 'la-buena',
        'wrapped_key_iv' => 'nonce-bueno',
    ]);

    $this->assertDatabaseMissing('vault_members', ['wrapped_key' => 'la-que-llega-despues']);
});

/*
 * The database does not admit a membership with no wrapped key, and not merely the
 * service. It is checked by skipping the service, which is the only way to know the
 * constraint really exists: a member with no key is somebody who cannot open their own
 * vault.
 */
it('the database refuses a membership with no wrapped key', function (): void {
    $user = User::factory()->create();
    $vault = Vault::factory()->create();

    expect(fn () => $vault->members()->attach($user->id, ['role' => VaultRole::Owner->value]))
        ->toThrow(QueryException::class);
});

it('generates a uuid identifier and not an integer', function (): void {
    $user = User::factory()->create();

    $vault = (new CreatePersonalVault)->handle($user->id, wrappedKey());

    expect($vault->id)->toBeString()
        ->and(Str::isUuid($vault->id))->toBeTrue();
});

/*
 * Idempotence. A retry of the sign-up must neither crash into the unique index nor
 * leave the user with two personal vaults.
 */
it('returns the existing vault instead of creating a second', function (): void {
    $user = User::factory()->create();
    $service = new CreatePersonalVault;

    $first = $service->handle($user->id, wrappedKey());
    $second = $service->handle($user->id, wrappedKey());

    expect($second->id)->toBe($first->id);

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseCount('vault_members', 1);
});

it('creates nothing when the user does not exist', function (): void {
    expect(fn () => (new CreatePersonalVault)->handle(99999, wrappedKey()))
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_members', 0);
});

/*
 * The guarantee that nobody has two personal vaults lives in the database and not
 * merely in the service. This test checks it by skipping the service entirely, which is
 * the only way to know the index really exists.
 */
it('the database prevents a second personal vault for the same user', function (): void {
    $user = User::factory()->create();
    Vault::factory()->personalFor($user)->create();

    expect(fn () => Vault::factory()->personalFor($user)->create())
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('vaults', 1);
});

it('deleting the user takes their personal vault with it', function (): void {
    $user = User::factory()->create();
    (new CreatePersonalVault)->handle($user->id, wrappedKey());

    $user->delete();

    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('vault_members', 0);
});
