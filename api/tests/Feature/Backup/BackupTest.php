<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\DB;

/*
 * Copia de seguridad y restauración. Ver el issue #129.
 *
 * Lo que se prueba aquí no es que el fichero se escriba, sino que sirva: una copia
 * que nadie ha restaurado nunca es un fichero, no una copia de seguridad.
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

/** El fichero que acaba de escribirse en la carpeta de la prueba. */
function latestBackup(string $directory): string
{
    $files = glob($directory.'/evault-*.json') ?: [];

    sort($files);

    return end($files);
}

it('escribe una copia con las cuatro tablas', function (): void {
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
 * Sin vault_members la copia es un montón de ciphertext que ya nadie puede abrir,
 * porque ahí vive la clave de vault envuelta. Es la diferencia entre una copia de
 * seguridad y un fichero grande.
 */
it('incluye la clave de vault envuelta', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $payload = json_decode((string) file_get_contents(latestBackup($this->directory)), true);

    expect($payload['tables']['vault_members'][0]['wrapped_key'])->toBe('clave-envuelta-de-prueba');
});

/*
 * El fichero lleva hashes de autenticación y claves envueltas. Nada de eso permite
 * descifrar la vault, pero tampoco conviene dejarlo legible para todo el mundo en
 * una máquina compartida.
 */
it('escribe el fichero con permisos restrictivos', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $permissions = substr(sprintf('%o', fileperms(latestBackup($this->directory))), -3);

    expect($permissions)->toBe('600');
});

it('conserva solo las copias que se le piden', function (): void {
    User::factory()->withPersonalVault()->create();

    for ($i = 0; $i < 4; $i++) {
        // El nombre lleva la hora hasta el segundo, así que hay que separarlas.
        $this->travel(1)->seconds();
        $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])
            ->assertSuccessful();
    }

    expect(glob($this->directory.'/evault-*.json'))->toHaveCount(2);
});

it('las conserva todas si se le dice que no rote', function (): void {
    User::factory()->withPersonalVault()->create();

    for ($i = 0; $i < 3; $i++) {
        $this->travel(1)->seconds();
        $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])
            ->assertSuccessful();
    }

    expect(glob($this->directory.'/evault-*.json'))->toHaveCount(3);
});

/*
 * EL TEST QUE JUSTIFICA TODO ESTE ISSUE.
 *
 * El ciclo entero: copiar, vaciar la instancia como si se hubiera perdido, restaurar
 * y comprobar que lo que vuelve es exactamente lo que había. Incluida la clave
 * envuelta, que es lo que permite que la contraseña maestra de siempre siga
 * abriendo la vault.
 */
it('restaura una instancia vacía dejándola como estaba', function (): void {
    $user = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);
    $vault = $user->personalVault;
    $item = $vault->items()->create([
        'ciphertext' => 'el-contenido-cifrado', 'iv' => 'el-nonce', 'version' => 2,
    ]);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();
    $backup = latestBackup($this->directory);

    // Se pierde la instancia entera.
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

it('se niega a restaurar encima de una instancia con datos', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();

    $this->artisan('evault:restore', ['file' => latestBackup($this->directory)])->assertFailed();

    // Y no ha tocado nada al negarse.
    expect(DB::table('users')->count())->toBe(1);
});

it('restaura encima si se le insiste', function (): void {
    User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();
    $backup = latestBackup($this->directory);

    User::factory()->withPersonalVault()->create(['email' => 'grace@evault.test']);

    $this->artisan('evault:restore', ['file' => $backup, '--force' => true])->assertSuccessful();

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
    $this->assertDatabaseMissing('users', ['email' => 'grace@evault.test']);
});

it('rechaza un fichero que no es una copia de eVault', function (): void {
    mkdir($this->directory, 0700, recursive: true);
    file_put_contents($this->directory.'/otra-cosa.json', '{"format":"otra-cosa"}');

    $this->artisan('evault:restore', ['file' => $this->directory.'/otra-cosa.json'])->assertFailed();
});

/*
 * Una copia de una versión que este comando no conoce podría traer columnas que aquí
 * no existen. Escribirla a medias es peor que no escribirla.
 */
it('rechaza una copia de otra versión del formato', function (): void {
    mkdir($this->directory, 0700, recursive: true);
    file_put_contents(
        $this->directory.'/futura.json',
        json_encode(['format' => 'evault-backup', 'version' => 99, 'tables' => []])
    );

    $this->artisan('evault:restore', ['file' => $this->directory.'/futura.json'])->assertFailed();
});

it('rechaza un fichero que no existe', function (): void {
    $this->artisan('evault:restore', ['file' => '/no/existe.json'])->assertFailed();
});

/*
 * La retención cuando el reloj no es de fiar. Ver el issue #240.
 *
 * El nombre llevaba solo la fecha, y la rotación ordenaba por él. Eso supone que las
 * fechas crecen, y en una máquina cuyo RTC no conserva la hora no crecen: systemd
 * restaura la del último apagado antes de que NTP corrija, así que durante los
 * primeros segundos de cada arranque la máquina cree estar en el pasado. Con eso, la
 * copia recién escrita quedaba primera en el orden y era la primera en borrarse.
 */

it('numera las copias, y el número crece aunque la fecha no', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    // El reloj se va diez días atrás, como al arrancar tras un apagado largo.
    $this->travelTo('2026-08-07 22:19:42');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    $names = array_map('basename', glob($this->directory.'/evault-*.json') ?: []);
    sort($names);

    expect($names)->toHaveCount(2)
        ->and($names[0])->toStartWith('evault-000001-')
        ->and($names[1])->toStartWith('evault-000002-')
        // Y la segunda lleva la fecha vieja, que es justo el caso que rompía el orden.
        ->and($names[1])->toContain('2026-08-07');
});

it('con el reloj hacia atrás NO borra la copia más reciente', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-15 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])->assertSuccessful();

    $this->travelTo('2026-08-16 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])->assertSuccessful();

    // La tercera se escribe con el reloj en el pasado, y es la que hay que conservar.
    $this->travelTo('2026-08-05 22:19:42');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 2])->assertSuccessful();

    $names = array_map('basename', glob($this->directory.'/evault-*.json') ?: []);
    sort($names);

    expect($names)->toHaveCount(2)
        // La borrada es la primera que se escribió, no la última.
        ->and($names)->not->toContain('evault-000001-2026-08-15-100000.json')
        ->and($names[1])->toStartWith('evault-000003-');
});

it('avisa cuando el reloj va por detrás de la copia anterior', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    $this->travelTo('2026-08-07 22:19:42');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])
        ->expectsOutputToContain('El reloj de esta máquina va por detrás')
        ->assertSuccessful();
});

it('no avisa del reloj cuando la fecha avanza con normalidad', function (): void {
    User::factory()->withPersonalVault()->create();

    $this->travelTo('2026-08-17 10:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    $this->travelTo('2026-08-17 11:00:00');
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])
        ->doesntExpectOutputToContain('El reloj de esta máquina va por detrás')
        ->assertSuccessful();
});

it('dos copias del mismo segundo no se pisan', function (): void {
    /*
     * Antes de #240 el nombre era solo la fecha con resolución de un segundo, así que
     * la segunda sobrescribía a la primera en silencio. El test que ya había de
     * rotación tenía que separarlas con travel() para no toparse con esto.
     */
    User::factory()->withPersonalVault()->create();
    $this->travelTo('2026-08-17 10:00:00');

    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();
    $this->artisan('evault:backup', ['--path' => $this->directory, '--keep' => 0])->assertSuccessful();

    expect(glob($this->directory.'/evault-*.json'))->toHaveCount(2);
});

it('las copias anteriores a la numeración se borran antes que las nuevas', function (): void {
    /*
     * La transición: en una instancia que ya tenía copias, las viejas no llevan
     * número. Son las más antiguas que hay, y la rotación tiene que tratarlas como
     * tales en vez de conservarlas mientras borra las nuevas.
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
