<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\Backup\BackupContents;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use JsonException;

/**
 * Copia de seguridad de la instancia.
 *
 * Escribe un fichero propio y NO un dump del motor, aunque un dump fuera más corto
 * de escribir. El motivo es concreto: el proyecto corre sobre MySQL o sobre SQLite,
 * y un dump de uno no se restaura en el otro. Con un formato propio, la copia hecha
 * en el servidor se puede restaurar en un portátil para comprobarla, que es
 * justamente lo que hace que un backup deje de ser un fichero y pase a ser una copia
 * de seguridad. Tampoco obliga a tener mysqldump instalado.
 *
 * EL FICHERO NO VA CIFRADO, y es una decisión, no un olvido. Los datos de usuario ya
 * salen cifrados de fábrica: lo que hay dentro son los mismos blobs opacos que
 * guarda el servidor, así que la copia se puede sacar de la máquina sin ceremonia.
 * Es un dividendo directo del modelo zero-knowledge que casi nunca se cobra.
 *
 * Lo que sí lleva, y conviene decirlo en vez de esconderlo: los hashes de
 * autenticación de `users` y las claves de vault envueltas. Ninguna de las dos cosas
 * permite descifrar nada —de eso trata ADR-008— pero tampoco son material que
 * convenga repartir alegremente. De ahí los permisos de abajo.
 */
final class BackupCommand extends Command
{
    protected $signature = 'evault:backup
        {--path= : Carpeta donde escribir la copia. Por defecto storage/app/backups}
        {--keep=7 : Cuántas copias conservar. 0 las conserva todas}';

    protected $description = 'Escribe una copia de seguridad restaurable de la instancia';

    public function handle(): int
    {
        $directory = $this->resolveDirectory();

        if (! is_dir($directory) && ! mkdir($directory, 0700, recursive: true) && ! is_dir($directory)) {
            $this->error("No se ha podido crear {$directory}.");

            return self::FAILURE;
        }

        $payload = [
            'format' => 'evault-backup',
            'version' => BackupContents::VERSION,
            'created_at' => now()->toIso8601String(),
            'tables' => [],
        ];

        foreach (BackupContents::TABLES as $table) {
            $payload['tables'][$table] = DB::table($table)->get()->map(
                fn (object $row): array => (array) $row
            )->all();
        }

        try {
            $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        } catch (JsonException $e) {
            $this->error("No se ha podido serializar la copia: {$e->getMessage()}");

            return self::FAILURE;
        }

        $file = $directory.'/evault-'.now()->format('Y-m-d-His').'.json';

        /*
         * Se crea con permisos restrictivos ANTES de escribir nada. Al revés habría
         * un instante con el fichero legible por todo el mundo, y ese instante basta
         * en una máquina compartida. Hay un test que comprueba el modo resultante.
         */
        touch($file);
        chmod($file, 0600);
        file_put_contents($file, $json);

        $this->info("Copia escrita en {$file}");

        $total = array_sum(array_map(count(...), $payload['tables']));
        $this->line("Filas copiadas: {$total}");

        $this->rotate($directory);

        return self::SUCCESS;
    }

    private function resolveDirectory(): string
    {
        $path = $this->option('path');

        return is_string($path) && $path !== '' ? rtrim($path, '/') : storage_path('app/backups');
    }

    /**
     * Borra las copias más antiguas.
     *
     * Existe porque una carpeta que crece sin fin acaba llenando el disco de la
     * máquina que guarda las contraseñas, y eso es una caída del servicio con muy
     * mala prensa. Conservar 0 desactiva la rotación, para quien prefiera gestionarla
     * fuera.
     */
    private function rotate(string $directory): void
    {
        $keep = (int) $this->option('keep');

        if ($keep <= 0) {
            return;
        }

        $files = glob($directory.'/evault-*.json') ?: [];

        // Por nombre, que lleva la fecha delante y ordena igual que por antigüedad
        // sin depender de la fecha de modificación del sistema de ficheros.
        sort($files);

        $extra = count($files) - $keep;

        for ($i = 0; $i < $extra; $i++) {
            unlink($files[$i]);
            $this->line('Copia antigua borrada: '.basename($files[$i]));
        }
    }
}
