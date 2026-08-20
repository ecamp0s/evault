<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultRole;

/**
 * A vault seen from the outside: just enough for the client to choose which one it
 * operates on and to open it.
 *
 * It is a DTO and not the model because what comes out of here is a reading, not an
 * entity: neither the role nor the wrapped key lives in the vaults table but in the
 * membership one, and hanging them off a model would force the consumer to know about
 * pivots to read them.
 *
 * It carries no item count on purpose, and not to save a query: counting them would be
 * something the server can compute and the client does not need from the server,
 * because it already downloads the whole vault.
 *
 * The wrapped key it carries is *this* user's, not the vault's in the abstract: once
 * there are shared vaults, two members will ask for the same vault and receive
 * different wrappings of the same key. See ADR-008.
 */
final readonly class VaultSummary
{
    public function __construct(
        public string $id,
        public string $name,
        public bool $isPersonal,
        public VaultRole $role,
        public WrappedVaultKey $wrappedKey,
    ) {}
}
