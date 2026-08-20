<?php

declare(strict_types=1);

namespace App\Models;

/**
 * A user's role inside a vault.
 *
 * In Iteration 2 only Owner exists, because only personal vaults exist. It is an enum
 * and not a loose string so that the set of values is closed from the start: once
 * shared vaults arrive, adding a role will be adding a case here, and static analysis
 * will point at every place that stops covering all the possibilities.
 */
enum VaultRole: string
{
    case Owner = 'owner';
}
