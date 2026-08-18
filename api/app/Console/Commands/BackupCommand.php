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
         * EL NÚMERO DE SECUENCIA VA DELANTE DE LA FECHA, Y NO ES DECORATIVO.
         *
         * La fecha sola no sirve para ordenar copias, porque el reloj de una máquina
         * no es monótono entre arranques: si el RTC no conserva la hora, systemd
         * restaura la del último apagado antes de que NTP corrija, así que durante los
         * primeros segundos la máquina cree estar en el pasado. Medido en la máquina de
         * despliegue, donde una copia de hoy se habría llamado como si fuera de hace
         * diez días. Ver #240.
         *
         * La secuencia sale de las copias que ya hay, así que crece siempre y no
         * depende de ningún reloj. Con ella, ordenar por nombre vuelve a ser ordenar
         * por antigüedad, que es lo que la rotación necesita, y de paso dos copias del
         * mismo segundo dejan de pisarse.
         *
         * La fecha se queda detrás porque es para quien lee la carpeta, no para el
         * código.
         */
        $sequence = $this->nextSequence($directory);
        $file = sprintf('%s/evault-%06d-%s.json', $directory, $sequence, now()->format('Y-m-d-His'));

        $this->warnIfClockWentBack($directory, $sequence);

        /*
         * Se crea con permisos restrictivos ANTES de escribir nada. Al revés habría
         * un instante con el fichero legible por todo el mundo, y ese instante basta
         * en una máquina compartida. Hay un test que comprueba el modo resultante.
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

    /** El número que le toca a la copia que se va a escribir. */
    private function nextSequence(string $directory): int
    {
        $highest = 0;

        foreach (glob($directory.'/evault-*.json') ?: [] as $file) {
            $highest = max($highest, self::sequenceOf($file));
        }

        return $highest + 1;
    }

    /**
     * El número de secuencia de una copia, o cero si no lo lleva.
     *
     * Cero es lo que devuelven las copias escritas antes de #240, y las deja donde
     * les corresponde: por delante de cualquiera de las nuevas, que es exactamente su
     * antigüedad relativa.
     */
    private static function sequenceOf(string $file): int
    {
        return preg_match('/^evault-(\d{6})-/', basename($file), $matches) === 1
            ? (int) $matches[1]
            : 0;
    }

    /**
     * Avisa si el reloj ha ido hacia atrás desde la última copia.
     *
     * La rotación ya no depende de esto —de eso trata la secuencia— pero callarlo
     * sería desperdiciar el único momento en que el problema es visible. Un reloj que
     * salta atrás deja una carpeta cuyas fechas no significan lo que parece, y quien
     * vaya a restaurar la va a leer por fecha.
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

        // Comparación de cadenas y no de fechas: el formato es ISO, así que el orden
        // lexicográfico y el cronológico son el mismo.
        if ($matches[1] > now()->format('Y-m-d-His')) {
            $this->warn(
                'El reloj de esta máquina va por detrás de la copia anterior. La rotación '
                .'no se ve afectada, pero las fechas de los nombres no sirven para ordenarlas.'
            );
        }
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

        /*
         * Por número de secuencia, con la fecha solo como desempate.
         *
         * CONVIENE SABER QUÉ ARREGLA CADA COSA, porque no es lo que parece. Lo que
         * corrige el fallo de #240 es que el NOMBRE lleve la secuencia delante: con eso,
         * hasta el `sort()` que había aquí ordenaría bien, y comprobado — sustituirlo
         * por `sort()` solo pone en rojo el test de las copias antiguas.
         *
         * Este `usort` cubre justo ese caso: las copias anteriores a #240 no llevan
         * número, y hay que tratarlas como las más viejas en vez de dejar que su fecha
         * compita con una secuencia. Entre ellas la fecha es lo único que hay.
         *
         * Y lo que NO se vuelve a hacer, con el motivo escrito para que nadie lo
         * reintroduzca: ordenar por fecha de modificación. Cambia al copiar un fichero,
         * así que mover las copias de sitio reordenaría su antigüedad.
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
