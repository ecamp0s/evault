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
function ultimaCopia(string $directory): string
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

    $payload = json_decode((string) file_get_contents(ultimaCopia($this->directory)), true);

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

    $payload = json_decode((string) file_get_contents(ultimaCopia($this->directory)), true);

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

    $permisos = substr(sprintf('%o', fileperms(ultimaCopia($this->directory))), -3);

    expect($permisos)->toBe('600');
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
    $copia = ultimaCopia($this->directory);

    // Se pierde la instancia entera.
    DB::table('vault_items')->delete();
    DB::table('vault_members')->delete();
    DB::table('vaults')->delete();
    DB::table('users')->delete();

    $this->artisan('evault:restore', ['file' => $copia])->assertSuccessful();

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

    $this->artisan('evault:restore', ['file' => ultimaCopia($this->directory)])->assertFailed();

    // Y no ha tocado nada al negarse.
    expect(DB::table('users')->count())->toBe(1);
});

it('restaura encima si se le insiste', function (): void {
    User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);

    $this->artisan('evault:backup', ['--path' => $this->directory])->assertSuccessful();
    $copia = ultimaCopia($this->directory);

    User::factory()->withPersonalVault()->create(['email' => 'grace@evault.test']);

    $this->artisan('evault:restore', ['file' => $copia, '--force' => true])->assertSuccessful();

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
