<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use Carbon\CarbonInterface;

/**
 * How long a deleted entry stays in the bin before the purge takes it.
 *
 * Thirty days and not seven because the window is what the backups do not cover:
 * with seven daily copies, a deletion noticed the week after has nowhere to come back
 * from. If the retention of the copies ever changes, this number has to be argued
 * again and not inherited. See ADR-018 §2.4 and §6.5.
 */
final class Trash
{
    public const int RETENTION_DAYS = 30;

    /** When the purge will take an entry deleted at that moment. */
    public static function purgesAt(CarbonInterface $deletedAt): CarbonInterface
    {
        return $deletedAt->copy()->addDays(self::RETENTION_DAYS);
    }

    /**
     * The newest deletion the purge takes at that moment: anything deleted at or before
     * it has had its thirty days. The inverse of purgesAt, so that what the bin
     * announces and what the purge does cannot disagree.
     */
    public static function purgeCutoff(CarbonInterface $now): CarbonInterface
    {
        return $now->copy()->subDays(self::RETENTION_DAYS);
    }
}
