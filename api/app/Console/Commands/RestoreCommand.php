<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\Backup\BackupContents;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use JsonException;

/**
 * Restores a backup.
 *
 * It goes in the same issue as the backup on purpose: a copy nobody has ever restored
 * is not a backup, it is a file. Without this command, the promise of being able to
 * recover the instance would be an assumption.
 *
 * It refuses to write over a database that already holds data unless pressed with
 * --force. Restoring on top of a live instance is destructive and there is no undo:
 * whatever items were there and are not in the copy disappear.
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
         * The version is checked before anything is touched. A copy written by a
         * version this command does not know could have columns that do not exist here,
         * and writing it halfway is worse than not writing it.
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
         * All or nothing. A half-done restore leaves an instance with users lacking
         * their wrapped key — that is, people who cannot open their own vault: the same
         * irreparable state the password rotation takes care to avoid.
         */
        DB::transaction(function () use ($tables): void {
            // In reverse order from writing, so as not to collide with foreign keys.
            foreach (array_reverse(BackupContents::TABLES) as $table) {
                DB::table($table)->delete();
            }

            foreach (BackupContents::TABLES as $table) {
                $rows = $tables[$table] ?? [];

                if ($rows === []) {
                    continue;
                }

                // In batches: a vault with thousands of items does not fit in a single
                // statement, and some engines have a ceiling on parameters.
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
