<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\DB;

/*
 * Backup and restore. See issue #129.
 *
 * What is tested here is not that the file gets written, but that it is of use: a copy
 * nobody has ever restored is a file, not a backup.
 */

beforeEach(function (): void {
    $this->directory = storage_path('framework/testing/backups-'.uniqid());
});

afterEach(function (): void {
    foreach (glob($this->directory.'/*') ?: [] as $file) {
        unlink($file);
    }

    if (is_dir($this->directory)) {
        rmdir($this->directory);
    }
});

/** The file just written into the test's folder. */
function latestBackup(string $directory): string
{
    $files = glob($directory.'/evault-*.json') ?: [];

    sort($files);

    return end($files);
}

it('writes a backup with the four tables', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $user->personalVault->items()->create([
        'ciphertext' => 'contenido-cifrado', 'iv' => 'nonce', 'version' => 2,
    ]);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $payload = json_decode((string) file_get_contents(latestBackup($this->directory)), true);

    expect($payload['format'])->toBe('evault-backup')
        ->and(array_keys($payload['tables']))
        ->toBe(['users', 'vaults', 'vault_members', 'vault_items'])
        ->and($payload['tables']['vault_items'])->toHaveCount(1);
});

/*
 * Without vault_members the copy is a pile of ciphertext nobody can open any more,
 * because the wrapped vault key lives there. It is the difference between a backup and
 * a large file.
 */
it('includes the wrapped vault key', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $payload = json_decode((string) file_get_contents(latestBackup($this->directory)), true);

    expect($payload['tables']['vault_members'][0]['wrapped_key'])->toBe('clave-envuelta-de-prueba');
});

/*
 * The file carries authentication hashes and wrapped keys. None of that allows
 * decrypting the vault, but neither is it worth leaving readable by everybody on a
 * shared machine.
 */
it('writes the file with restrictive permissions', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $permissions = substr(sprintf('%o', fileperms(latestBackup($this->directory))), -3);

    expect($permissions)->toBe('600');
});

it('keeps only as many copies as it is asked to', function (): void {
    User::factory()->withPersonalVault()->create();

    for ($i = 0; $i < 4; $i++) {
        // The name carries the time down to the second, so they have to be spread out.
        $this->travel(1)->seconds();
        $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])
            ->assertSuccessful();
    }

    expect(glob($this->directory.'/evault-*.json'))->toHaveCount(2);
});

it('keeps them all when told not to rotate', function (): void {
    User::factory()->withPersonalVault()->create();

    for ($i = 0; $i < 3; $i++) {
        $this->travel(1)->seconds();
        $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])
            ->assertSuccessful();
    }

    expect(glob($this->directory.'/evault-*.json'))->toHaveCount(3);
});

/*
 * THE TEST THAT JUSTIFIES THIS WHOLE ISSUE.
 *
 * The full cycle: copy, empty the instance as if it had been lost, restore, and check
 * that what comes back is exactly what was there. The wrapped key included, which is
 * what lets the usual master password keep opening the vault.
 */
it('restores an empty instance leaving it as it was', function (): void {
    $user = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);
    $vault = $user->personalVault;
    $item = $vault->items()->create([
        'ciphertext' => 'el-contenido-cifrado', 'iv' => 'el-nonce', 'version' => 2,
    ]);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();
    $backup = latestBackup($this->directory);

    // The whole instance is lost.
    DB::table('vault_items')->delete();
    DB::table('vault_members')->delete();
    DB::table('vaults')->delete();
    DB::table('users')->delete();

    $this->artisan('evault:restore', ['file' => $backup])->assertSuccessful();

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
    $this->assertDatabaseHas('vaults', ['id' => $vault->id]);
    $this->assertDatabaseHas('vault_items', [
        'id' => $item->id, 'ciphertext' => 'el-contenido-cifrado', 'iv' => 'el-nonce',
    ]);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault->id,
        'user_id' => $user->id,
        'wrapped_key' => 'clave-envuelta-de-prueba',
    ]);
});

it('refuses to restore over an instance that holds data', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $this->artisan('evault:restore', ['file' => latestBackup($this->directory)])->assertFailed();

    // And it touched nothing when refusing.
    expect(DB::table('users')->count())->toBe(1);
});

it('restores over it when pressed', function (): void {
    User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();
    $backup = latestBackup($this->directory);

    User::factory()->withPersonalVault()->create(['email' => 'grace@evault.test']);

    $this->artisan('evault:restore', ['file' => $backup, '--force' => true])->assertSuccessful();

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
    $this->assertDatabaseMissing('users', ['email' => 'grace@evault.test']);
});

it('refuses a file that is not an eVault backup', function (): void {
    mkdir($this->directory, 0700, recursive: true);
    file_put_contents($this->directory.'/otra-cosa.json', '{"format":"otra-cosa"}');

    $this->artisan('evault:restore', ['file' => $this->directory.'/otra-cosa.json'])->assertFailed();
});

/*
 * A copy from a version this command does not know could bring columns that do not
 * exist here. Writing it halfway is worse than not writing it.
 */
it('refuses a copy from another version of the format', function (): void {
    mkdir($this->directory, 0700, recursive: true);
    file_put_contents(
        $this->directory.'/futura.json',
        json_encode(['format' => 'evault-backup', 'version' => 99, 'tables' => []])
    );

    $this->artisan('evault:restore', ['file' => $this->directory.'/futura.json'])->assertFailed();
});

it('refuses a file that does not exist', function (): void {
    $this->artisan('evault:restore', ['file' => '/no/existe.json'])->assertFailed();
});

/*
 * Retention when the clock cannot be trusted. See issue #240.
 *
 * The name carried the date alone, and the rotation ordered by it. That assumes dates
 * grow, and on a machine whose RTC does not keep the time they do not: systemd restores
 * the one from the last shutdown before NTP corrects it, so for the first few seconds
 * of every boot the machine believes it is in the past. With that, the copy just
 * written came first in the order and was the first to be deleted.
 */

it('numbers the copies, and the number grows even when the date does not', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    // The clock goes ten days back, as it does on booting after a long shutdown.
    $this->travelTo('2026-08-07 22:19:42');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    $names = array_map('basename', glob($this->directory.'/evault-*.json') ?: []);
    sort($names);

    expect($names)->toHaveCount(2)
        ->and($names[0])->toStartWith('evault-000001-')
        ->and($names[1])->toStartWith('evault-000002-')
        // And the second carries the old date, which is exactly the case that broke the order.
        ->and($names[1])->toContain('2026-08-07');
});

it('with the clock gone backwards it does NOT delete the most recent copy', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-15 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])->assertSuccessful();

    $this->travelTo('2026-08-16 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])->assertSuccessful();

    // The third is written with the clock in the past, and it is the one to keep.
    $this->travelTo('2026-08-05 22:19:42');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])->assertSuccessful();

    $names = array_map('basename', glob($this->directory.'/evault-*.json') ?: []);
    sort($names);

    expect($names)->toHaveCount(2)
        // The one deleted is the first written, not the last.
        ->and($names)->not->toContain('evault-000001-2026-08-15-100000.json')
        ->and($names[1])->toStartWith('evault-000003-');
});

it('warns when the clock runs behind the previous copy', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    $this->travelTo('2026-08-07 22:19:42');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])
        ->expectsOutputToContain('El reloj de esta máquina va por detrás')
        ->assertSuccessful();
});

it('does not warn about the clock when the date advances normally', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    $this->travelTo('2026-08-17 11:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])
        ->doesntExpectOutputToContain('El reloj de esta máquina va por detrás')
        ->assertSuccessful();
});

it('two copies from the same second do not overwrite each other', function (): void {
    /*
     * Before #240 the name was the date alone with one-second resolution, so the second
     * overwrote the first in silence. The rotation test that already existed had to
     * spread them out with travel() so as not to run into this.
     */
    User::factory()->withPersonalVault()->create();
    $this->travelTo('2026-08-17 10:00:00');

    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    expect(glob($this->directory.'/evault-*.json'))->toHaveCount(2);
});

it('copies from before the numbering are deleted before the new ones', function (): void {
    /*
     * The transition: on an instance that already had copies, the old ones carry no
     * number. They are the oldest there are, and the rotation has to treat them as such
     * instead of keeping them while it deletes the new ones.
     */
    User::factory()->withPersonalVault()->create();
    mkdir($this->directory, 0700, true);
    touch($this->directory.'/evault-2026-08-01-100000.json');

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 1])->assertSuccessful();

    $names = array_map('basename', glob($this->directory.'/evault-*.json') ?: []);

    expect($names)->toHaveCount(1)
        ->and($names[0])->toStartWith('evault-000001-');
});

/*
 * From here on, #263: that an empty copy stops being indistinguishable from a good
 * one.
 *
 * What these tests protect is not the file: it is that the CHAIN does not say all went
 * well when there was nothing to copy. On the remote there were seven copies of 2.378
 * bytes and one of 210.855, and nothing told them apart.
 *
 * This block used to carry a note saying its names were in English while those above
 * stayed in Spanish until the conversion of #290. That conversion reached this file in
 * #319, so the note has lost its subject and goes with it.
 */

it('refuses to write a backup when there is nothing to copy', function (): void {
    expect(DB::table('users')->count())->toBe(0);

    $this->artisan('evault:backup', ['--path' => $this->directory])
        ->expectsOutputToContain('no tiene ningún dato que copiar')
        ->assertFailed();

    expect(glob($this->directory.'/evault-*.json') ?: [])->toBeEmpty();
});

it('writes an empty backup when explicitly asked to', function (): void {
    $this->artisan('evault:backup', ['--path' => $this->directory, '--allow-empty' => true])
        ->assertSuccessful();

    expect(glob($this->directory.'/evault-*.json') ?: [])->toHaveCount(1);
});

/*
 * The case that really does damage, and the one no check in the script could see: the
 * database loses almost everything and the resulting copy is perfectly valid.
 */
it('refuses when the row count collapses against the previous copy', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    foreach (range(1, 10) as $n) {
        $user->personalVault->items()->create([
            'ciphertext' => "cifrado-{$n}", 'iv' => "nonce-{$n}", 'version' => 2,
        ]);
    }

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    DB::table('vault_items')->delete();

    $this->artisan('evault:backup', ['--path' => $this->directory])
        ->expectsOutputToContain('por debajo del mínimo')
        ->assertFailed();

    expect(glob($this->directory.'/evault-*.json') ?: [])->toHaveCount(1);
});

it('allows a shrink that stays above the ratio', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    foreach (range(1, 10) as $n) {
        $user->personalVault->items()->create([
            'ciphertext' => "cifrado-{$n}", 'iv' => "nonce-{$n}", 'version' => 2,
        ]);
    }

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    // From 13 rows to 11: an ordinary loss, which cannot stop the backup.
    DB::table('vault_items')->limit(2)->delete();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    expect(glob($this->directory.'/evault-*.json') ?: [])->toHaveCount(2);
});

it('lets the shrink through when the check is disabled', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $user->personalVault->items()->create([
        'ciphertext' => 'cifrado', 'iv' => 'nonce', 'version' => 2,
    ]);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    DB::table('vault_items')->delete();

    $this->artisan('evault:backup', ['--path' => $this->directory, '--min-ratio' => '0'])
        ->assertSuccessful();

    expect(glob($this->directory.'/evault-*.json') ?: [])->toHaveCount(2);
});

/*
 * Without the breakdown, the cron log says the same for a copy of 370 passwords and
 * for a copy of none. It is the line somebody will read three weeks later to find out
 * whether that night's copy was any good.
 */
it('reports how many rows it copied, broken down by table', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $user->personalVault->items()->create([
        'ciphertext' => 'cifrado', 'iv' => 'nonce', 'version' => 2,
    ]);

    $this->artisan('evault:backup', ['--path' => $this->directory])
        ->expectsOutputToContain('Filas copiadas: 4 (users 1, vaults 1, vault_members 1, vault_items 1)')
        ->assertSuccessful();
});

/*
 * A previous copy that cannot be read must not break the chain: it would turn one
 * corrupt file into a permanently blocked backup, which is worse than the failure it
 * guards against.
 */
it('does not block the backup when the previous copy cannot be read', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $user->personalVault->items()->create([
        'ciphertext' => 'cifrado', 'iv' => 'nonce', 'version' => 2,
    ]);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    file_put_contents(latestBackup($this->directory), 'esto no es json');

    $this->artisan('evault:backup', ['--path' => $this->directory])
        ->expectsOutputToContain('no es un JSON válido')
        ->assertSuccessful();
});
