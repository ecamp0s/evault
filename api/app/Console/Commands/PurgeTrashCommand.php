<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Application\Vaults\PurgeExpiredTrash;
use App\Application\Vaults\Trash;
use Illuminate\Console\Command;

/**
 * The purge of the bin, to be run by cron like evault:backup (ADR-018 §4).
 *
 * It says what it did in one line, so that the cron log answers «is the bin being
 * emptied?» weeks later, and it prints the cutoff so that a wrong clock shows.
 *
 * THE CLOCK. kastor's is not monotonic across boots: for the first seconds it can
 * believe it is days in the past (#240). That errs on the safe side here —an early
 * clock purges LESS, and the next run catches up— and it is why nothing is ever
 * computed from the date of the previous run.
 *
 * AND THE BACKUP. evault:backup refuses a copy with less than half the rows of the
 * previous one (#263). Deleting no longer shrinks anything, because the rows stay in
 * the bin; this command does, thirty days later. Only a purge of more than half the
 * instance trips it, and then the refusal is right to ask: DEPLOYMENT.md §7 says how
 * to tell the two apart.
 */
final class PurgeTrashCommand extends Command
{
    protected $signature = 'evault:purge-trash
        {--dry-run : Dice cuántas entradas purgaría, sin borrar ninguna}';

    protected $description = 'Borra del todo las entradas que llevan 30 días o más en la papelera';

    public function handle(PurgeExpiredTrash $purgeExpiredTrash): int
    {
        $now = now();
        $cutoff = Trash::purgeCutoff($now)->toIso8601String();
        $dryRun = $this->option('dry-run') === true;

        $count = $purgeExpiredTrash->handle($now, $dryRun);

        $this->line($dryRun
            ? "Se purgarían {$count} entradas de la papelera, borradas hasta el {$cutoff}. No se ha borrado nada."
            : "Purgadas {$count} entradas de la papelera, borradas hasta el {$cutoff}.");

        return self::SUCCESS;
    }
}
