<?php

declare(strict_types=1);

use App\Application\Backup\BackupContents;
use App\Models\Passkey;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/*
 * The passkeys table. See ADR-021 and issue #558.
 *
 * There are no endpoints yet — they arrive in #559 and #560 — so what is checked here
 * is what the schema and the model promise on their own: that the hash is never stored
 * as it was received, that a credential belongs to one account and one only, and that
 * the row disappears with what it hangs off.
 */

it('never stores the authentication hash as it arrived', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $passkey = Passkey::factory()->create([
        'user_id' => $user->id,
        'vault_id' => $user->personalVault->id,
        'auth_hash' => 'el-hash-derivado-del-prf',
    ]);

    $stored = DB::table('passkeys')->where('id', $passkey->id)->value('auth_hash');

    expect($stored)->not->toBe('el-hash-derivado-del-prf')
        ->and(Hash::check('el-hash-derivado-del-prf', (string) $stored))->toBeTrue();
});

/*
 * THE CROSS-TENANT ISOLATION TEST, which this project asks of every critical service.
 * It reads oddly at model level and it is the level where the guarantee starts: if the
 * relation ever returned somebody else's passkey, every endpoint built on top would
 * inherit it.
 */
it('does not hand one account the passkeys of another', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $ada->id, 'vault_id' => $ada->personalVault->id,
    ]);
    Passkey::factory()->count(2)->create([
        'user_id' => $grace->id, 'vault_id' => $grace->personalVault->id,
    ]);

    expect($ada->passkeys()->count())->toBe(1)
        ->and($grace->passkeys()->count())->toBe(2)
        ->and($ada->passkeys->pluck('user_id')->unique()->all())->toBe([$ada->id]);
});

it('refuses the same credential twice, whoever brings it', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $ada->id,
        'vault_id' => $ada->personalVault->id,
        'credential_id' => 'la-misma-credencial',
    ]);

    expect(fn (): Passkey => Passkey::factory()->create([
        'user_id' => $grace->id,
        'vault_id' => $grace->personalVault->id,
        'credential_id' => 'la-misma-credencial',
    ]))->toThrow(QueryException::class);
});

it('lets one account hold several passkeys', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    Passkey::factory()->count(3)->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);

    expect($user->passkeys()->count())->toBe(3);
});

it('goes away with the account it belongs to', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);

    $user->delete();

    expect(DB::table('passkeys')->count())->toBe(0);
});

it('goes away with the vault it opens', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);

    $user->personalVault->delete();

    expect(DB::table('passkeys')->count())->toBe(0);
});

it('remembers which hostname the credential belongs to', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $passkey = Passkey::factory()->create([
        'user_id' => $user->id,
        'vault_id' => $user->personalVault->id,
        'rp_id' => 'un-nombre-cualquiera',
    ]);

    expect($passkey->fresh()->rp_id)->toBe('un-nombre-cualquiera');
});

/*
 * ADR-021 §7 warns that this list is explicit and a new table does not join it on its
 * own. A restore missing the passkeys comes back with a vault that opens with the
 * master password and not with the face, and nobody finds out until they try.
 */
it('travels in the backup, because that list does not grow by itself', function (): void {
    expect(BackupContents::TABLES)->toContain('passkeys');
});
