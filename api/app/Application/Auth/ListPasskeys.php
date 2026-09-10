<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\Passkey;
use Illuminate\Support\Collection;

/**
 * A user's passkeys, for the screen that manages them. See ADR-021.
 *
 * IT SELECTS THE COLUMNS EXPLICITLY, and that is the point of this class rather than a
 * detail of it. The wrapper and the hash have no business leaving the server for a list:
 * the wrapper is only needed at the moment of unlocking, and the hash is never needed at
 * all. Selecting everything and trusting the resource to hide them would put the whole
 * guarantee in one file that somebody edits later.
 *
 * Ordered by creation so the list does not move around between loads.
 *
 * @return Collection<int, Passkey>
 */
final readonly class ListPasskeys
{
    /**
     * @return Collection<int, Passkey>
     */
    public function handle(int $userId): Collection
    {
        return Passkey::query()
            ->where('user_id', $userId)
            ->orderBy('created_at')
            ->get(['id', 'label', 'rp_id', 'created_at', 'last_used_at']);
    }
}
