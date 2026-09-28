<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Carbon\CarbonInterface;

/**
 * One open session, as the list shows it: never the token nor its hash.
 *
 * client is 'web', 'extension', 'recovery' for a recovery under way, or null for a
 * token issued before clients said which they were.
 */
final readonly class SessionSummary
{
    public function __construct(
        public int $id,
        public ?string $client,
        public ?CarbonInterface $createdAt,
        public ?CarbonInterface $lastUsedAt,
        public ?CarbonInterface $expiresAt,
        public bool $current,
    ) {}
}
