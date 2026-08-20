<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\Backup\BackupContents;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use JsonException;

/**
 * Backup of the instance.
 *
 * It writes a format of its own and NOT an engine dump, even though a dump would be
 * shorter to write. The reason is concrete: the project runs on MySQL or on SQLite,
 * and a dump of one does not restore into the other. With a format of its own, the
 * copy made on the server can be restored on a laptop to check it, which is precisely
 * what turns a backup from a file into a backup. It also does not require having
 * mysqldump installed.
 *
 * THE FILE IS NOT ENCRYPTED, and that is a decision, not an omission. The user data
 * comes out encrypted already: what is inside are the same opaque blobs the server
 * stores, so the copy can leave the machine without ceremony. It is a direct dividend
 * of the zero-knowledge model that almost never gets collected.
 *
 * What it does carry, and it is better said than hidden: the authentication hashes
 * from `users` and the wrapped vault keys. Neither allows decrypting anything — that
 * is what ADR-008 is about — but neither is material to hand around cheerfully.
 * Hence the permissions below.
 */
final class BackupCommand extends Command
{
    protected $signature = 'evault:backup
        {--path= : Carpeta donde escribir la copia. Por defecto storage/app/backups}
        {--keep=7 : Cuántas copias conservar. 0 las conserva todas}
        {--allow-empty : Escribe la copia aunque la instancia no tenga ningún dato}
        {--min-ratio=0.5 : Fracción mínima de filas respecto a la copia anterior. 0 desactiva la comprobación}';

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

        /** @var array<string, list<array<string, mixed>>> $tables */
        $tables = $payload['tables'];
        $rows = array_map(count(...), $tables);
        $total = array_sum($rows);

        if (! $this->hasEnoughContent($directory, $total, $rows)) {
            return self::FAILURE;
        }

        try {
            $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        } catch (JsonException $e) {
            $this->error("No se ha podido serializar la copia: {$e->getMessage()}");

            return self::FAILURE;
        }

        /*
         * THE SEQUENCE NUMBER GOES BEFORE THE DATE, AND IT IS NOT DECORATIVE.
         *
         * The date alone is no use for ordering copies, because a machine's clock is
         * not monotonic across boots: if the RTC does not keep the time, systemd
         * restores the one from the last shutdown before NTP corrects it, so for the
         * first few seconds the machine believes it is in the past. Measured on the
         * deployment machine, where a copy made today would have been named as if it
         * were ten days old. See #240.
         *
         * The sequence comes from the copies already there, so it always grows and
         * depends on no clock. With it, ordering by name is ordering by age again,
         * which is what the rotation needs, and two copies from the same second stop
         * overwriting each other.
         *
         * The date stays behind because it is for whoever reads the folder, not for
         * the code.
         */
        $sequence = $this->nextSequence($directory);
        $file = sprintf('%s/evault-%06d-%s.json', $directory, $sequence, now()->format('Y-m-d-His'));

        $this->warnIfClockWentBack($directory, $sequence);

        /*
         * It is created with restrictive permissions BEFORE anything is written. The
         * other way round there would be an instant with the file readable by
         * everybody, and that instant is enough on a shared machine. There is a test
         * that checks the resulting mode.
         */
        touch($file);
        chmod($file, 0600);
        file_put_contents($file, $json);

        $this->info("Copia escrita en {$file}");

        /*
         * The per-table breakdown is the only thing that tells a good backup from a
         * backup of nothing when someone reads the cron log three weeks later. One
         * line on purpose, so it fits there. See #263.
         */
        $breakdown = implode(', ', array_map(
            static fn (string $table, int $count): string => "{$table} {$count}",
            array_keys($rows),
            array_values($rows),
        ));

        $this->line("Filas copiadas: {$total} ({$breakdown})");

        $this->rotate($directory);

        return self::SUCCESS;
    }

    /**
     * Whether the data we are about to write looks like a real backup.
     *
     * WHY THIS EXISTS AT ALL — #263. The script that runs this from cron used to
     * check four things: that age wrote its header, that rclone did not fail, that
     * the file reached the remote, and retention. None of them looked at whether
     * the copy contained anything, so a backup of an empty database passed all four
     * and logged the same "copia cifrada y subida" as a good one. Seven of the eight
     * copies on the remote were 2.378 bytes; the one with 370 real passwords was
     * 210.855. Nothing could tell them apart.
     *
     * With 30 daily copies kept, an emptying nobody noticed for 30 days would rotate
     * every good copy out and leave thirty copies of nothing — all correctly
     * encrypted, correctly uploaded and correctly verified.
     *
     * TWO CHECKS, AND THEY GUARD DIFFERENT FAILURES.
     *
     * Empty is the obvious one and needs no threshold: an instance with no users has
     * nothing to back up, and writing that file can only overwrite better ones. It is
     * refused rather than warned about, because a warning in a cron log is a warning
     * nobody reads. --allow-empty exists for the one legitimate case, a brand new
     * instance being set up.
     *
     * Shrinkage is the subtler one and it is where the real damage lives: a database
     * that loses most of its rows still produces a perfectly valid file. Comparing
     * against the previous copy catches it. The ratio is deliberately generous —
     * losing half of everything at once is not something that happens by accident in
     * a personal vault — because the opposite failure is worse than the one being
     * fixed: a check that cries wolf on ordinary deletions is a check that gets
     * bypassed, and then it protects nothing. That is the lesson from #62.
     *
     * WHAT THIS DOES NOT DO, said out loud so nobody assumes otherwise: it cannot
     * tell whether the ciphertext inside is intact. The server cannot read it — that
     * is ADR-001 working as intended — so the only real proof remains restoring a
     * copy and opening the vault from it, which is #266.
     *
     * @param  array<string, int>  $rows  row count per table
     */
    private function hasEnoughContent(string $directory, int $total, array $rows): bool
    {
        if ($total === 0) {
            if ($this->option('allow-empty') === true) {
                $this->warn('La instancia no tiene ningún dato, y se copia igualmente porque se ha pedido --allow-empty.');

                return true;
            }

            $this->error('La instancia no tiene ningún dato que copiar, así que no se escribe ninguna copia.');
            $this->line('Si es una instancia recién instalada y esto es lo esperado, repite con --allow-empty.');

            return false;
        }

        $minimumShare = (float) $this->option('min-ratio');

        if ($minimumShare <= 0.0) {
            return true;
        }

        $previous = $this->rowsInPreviousBackup($directory);

        if ($previous === null || $previous === 0) {
            return true;
        }

        $minimumRows = (int) ceil($previous * $minimumShare);

        if ($total >= $minimumRows) {
            return true;
        }

        $this->error("La copia tendría {$total} filas y la anterior tenía {$previous}: por debajo del mínimo de {$minimumRows}.");
        $this->line('No se escribe nada. Si la pérdida de datos es intencionada, repite con --min-ratio=0.');

        return false;
    }

    /**
     * Row count of the most recent backup in the directory, or null if unreadable.
     *
     * A previous copy that cannot be parsed is NOT a reason to refuse the new one:
     * that would turn one corrupt file into a permanently broken backup chain, which
     * is a worse failure than the one being guarded against. It warns and lets the
     * backup through.
     */
    private function rowsInPreviousBackup(string $directory): ?int
    {
        $files = glob($directory.'/evault-*.json') ?: [];

        if ($files === []) {
            return null;
        }

        // By sequence number, like everything else here: the clock is not monotonic
        // between boots and sorting by date would pick the wrong file. See #240.
        usort($files, fn (string $a, string $b): int => self::sequenceOf($a) <=> self::sequenceOf($b));
        $latest = (string) end($files);

        $contents = @file_get_contents($latest);

        if ($contents === false) {
            $this->warn('No se ha podido leer la copia anterior, así que no se compara con ella.');

            return null;
        }

        try {
            // Deliberately left as mixed: this comes off disk and is not ours to
            // trust. Annotating its shape would make the checks below tautological
            // and static analysis would rightly call them dead code.
            $parsed = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $this->warn('La copia anterior no es un JSON válido, así que no se compara con ella.');

            return null;
        }

        if (! is_array($parsed) || ! isset($parsed['tables']) || ! is_array($parsed['tables'])) {
            return null;
        }

        $rowCount = 0;

        foreach ($parsed['tables'] as $table) {
            if (is_array($table)) {
                $rowCount += count($table);
            }
        }

        return $rowCount;
    }

    private function resolveDirectory(): string
    {
        $path = $this->option('path');

        return is_string($path) && $path !== '' ? rtrim($path, '/') : storage_path('app/backups');
    }

    /** The number due to the copy about to be written. */
    private function nextSequence(string $directory): int
    {
        $highest = 0;

        foreach (glob($directory.'/evault-*.json') ?: [] as $file) {
            $highest = max($highest, self::sequenceOf($file));
        }

        return $highest + 1;
    }

    /**
     * The sequence number of a copy, or zero when it carries none.
     *
     * Zero is what copies written before #240 return, and it leaves them where they
     * belong: ahead of any of the new ones, which is exactly their relative age.
     */
    private static function sequenceOf(string $file): int
    {
        return preg_match('/^evault-(\d{6})-/', basename($file), $matches) === 1
            ? (int) $matches[1]
            : 0;
    }

    /**
     * Warns when the clock has gone backwards since the last copy.
     *
     * The rotation no longer depends on this — that is what the sequence is for — but
     * staying quiet would waste the one moment the problem is visible. A clock that
     * jumps back leaves a folder whose dates do not mean what they appear to, and
     * whoever goes to restore will read it by date.
     */
    private function warnIfClockWentBack(string $directory, int $sequence): void
    {
        if ($sequence <= 1) {
            return;
        }

        $previous = null;

        foreach (glob($directory.'/evault-*.json') ?: [] as $file) {
            if (self::sequenceOf($file) === $sequence - 1) {
                $previous = $file;
            }
        }

        if ($previous === null || preg_match('/-(\d{4}-\d{2}-\d{2}-\d{6})\.json$/', basename($previous), $matches) !== 1) {
            return;
        }

        // String comparison and not date comparison: the format is ISO, so
        // lexicographic order and chronological order are the same.
        if ($matches[1] > now()->format('Y-m-d-His')) {
            $this->warn(
                'El reloj de esta máquina va por detrás de la copia anterior. La rotación '
                .'no se ve afectada, pero las fechas de los nombres no sirven para ordenarlas.'
            );
        }
    }

    /**
     * Deletes the oldest copies.
     *
     * It exists because a folder that grows without end eventually fills the disk of
     * the machine holding the passwords, and that is an outage with very bad press.
     * Keeping 0 turns the rotation off, for whoever would rather manage it elsewhere.
     */
    private function rotate(string $directory): void
    {
        $keep = (int) $this->option('keep');

        if ($keep <= 0) {
            return;
        }

        $files = glob($directory.'/evault-*.json') ?: [];

        /*
         * By sequence number, with the date only as a tie-break.
         *
         * IT IS WORTH KNOWING WHAT FIXES WHAT, because it is not what it looks like.
         * What corrects the failure of #240 is the NAME carrying the sequence in
         * front: with that, even the `sort()` that used to be here would order
         * correctly, and it was checked — replacing this with `sort()` only puts the
         * test of the old copies in red.
         *
         * This `usort` covers precisely that case: copies from before #240 carry no
         * number, and they have to be treated as the oldest instead of letting their
         * date compete with a sequence. Among themselves the date is all there is.
         *
         * And what is NOT done again, with the reason written down so nobody
         * reintroduces it: ordering by modification time. It changes when a file is
         * copied, so moving the copies elsewhere would reorder their age.
         */
        usort($files, function (string $first, string $second): int {
            return [self::sequenceOf($first), basename($first)]
                <=> [self::sequenceOf($second), basename($second)];
        });

        $extra = count($files) - $keep;

        for ($i = 0; $i < $extra; $i++) {
            unlink($files[$i]);
            $this->line('Copia antigua borrada: '.basename($files[$i]));
        }
    }
}
