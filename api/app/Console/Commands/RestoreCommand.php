<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\Backup\BackupContents;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use JsonException;

/**
 * Restaura una copia de seguridad.
 *
 * Va en el mismo issue que el backup a propósito: una copia que nadie ha restaurado
 * nunca no es una copia de seguridad, es un fichero. Sin este comando, la promesa de
 * poder recuperar la instancia sería una suposición.
 *
 * Se niega a escribir sobre una base de datos que ya tiene datos salvo que se le
 * insista con --force. Restaurar encima de una instancia viva es destructivo y no
 * hay deshacer: los items que hubiera y no estén en la copia desaparecen.
 */
final class RestoreCommand extends Command
{
    protected $signature = 'evault:restore
        {file : El fichero de copia}
        {--force : Restaurar aunque la base de datos ya tenga datos}';

    protected $description = 'Restaura una copia de seguridad sobre una base de datos vacía';

    public function handle(): int
    {
        $file = (string) $this->argument('file');

        if (! is_file($file)) {
            $this->error("No existe {$file}.");

            return self::FAILURE;
        }

        try {
            /** @var array{format?: string, version?: int, tables?: array<string, list<array<string, mixed>>>} $payload */
            $payload = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $this->error('El fichero no es una copia de eVault: no se puede leer como JSON.');

            return self::FAILURE;
        }

        if (($payload['format'] ?? null) !== 'evault-backup') {
            $this->error('El fichero no es una copia de eVault.');

            return self::FAILURE;
        }

        /*
         * La versión se comprueba antes de tocar nada. Una copia escrita por una
         * versión que este comando no conoce podría tener columnas que aquí no
         * existen, y escribirla a medias es peor que no escribirla.
         */
        if (($payload['version'] ?? null) !== BackupContents::VERSION) {
            $this->error('Esta copia la escribió otra versión de eVault. No se restaura a ciegas.');

            return self::FAILURE;
        }

        if ($this->hasData() && ! $this->option('force')) {
            $this->error('La base de datos ya tiene datos. Restaurar encima los sustituye.');
            $this->line('Si es lo que quieres, repite con --force.');

            return self::FAILURE;
        }

        $tables = $payload['tables'] ?? [];

        /*
         * Todo o nada. Una restauración a medias deja una instancia con usuarios sin
         * su clave envuelta, es decir, gente que no puede abrir su propia vault: el
         * mismo estado irreparable que la rotación de contraseña se cuida de evitar.
         */
        DB::transaction(function () use ($tables): void {
            // Al revés que al escribir, para no chocar con las claves ajenas.
            foreach (array_reverse(BackupContents::TABLES) as $table) {
                DB::table($table)->delete();
            }

            foreach (BackupContents::TABLES as $table) {
                $rows = $tables[$table] ?? [];

                if ($rows === []) {
                    continue;
                }

                // Por lotes: una vault con miles de items no cabe en una sola
                // sentencia, y algunos motores tienen un tope de parámetros.
                foreach (array_chunk($rows, 200) as $chunk) {
                    DB::table($table)->insert($chunk);
                }

                $this->line(count($rows)." filas en {$table}");
            }
        });

        $this->info('Copia restaurada.');

        return self::SUCCESS;
    }

    private function hasData(): bool
    {
        foreach (BackupContents::TABLES as $table) {
            if (DB::table($table)->exists()) {
                return true;
            }
        }

        return false;
    }
}
