<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultItem;
use Carbon\CarbonInterface;

/**
 * Empties what has had its thirty days in the bin, in every vault (ADR-018 §2.4).
 *
 * «A bin that is never emptied is not a bin: it is a deletion that does not delete».
 * This is what makes the thirty days true.
 *
 * It takes NO user and no vault, unlike every other service here, and it is not an
 * oversight: it is housekeeping of the instance, run by its owner from a cron, and
 * what it may touch is fixed by the date alone. It never reads a blob, and it only
 * ever reaches rows that are already in the bin.
 *
 * It takes EVERYTHING that is due and not only what fell due today, so catching up is
 * its normal behaviour and not a special case: kastor switches itself off, and the
 * cron may not run for days (DEPLOYMENT.md, #264).
 */
final readonly class PurgeExpiredTrash
{
    /** @return int how many entries it purged, or would purge when $dryRun */
    public function handle(CarbonInterface $now, bool $dryRun = false): int
    {
        $due = VaultItem::query()
            ->onlyTrashed()
            ->where('deleted_at', '<=', Trash::purgeCutoff($now));

        if ($dryRun) {
            return $due->count();
        }

        $purged = $due->forceDelete();

        return is_int($purged) ? $purged : 0;
    }
}
