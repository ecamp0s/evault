<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * What whoever has proven they hold the recovery key takes away: the wrappers only
 * that key opens, and a token to finish the operation.
 *
 * The token is NOT an ordinary session. It is good only for setting a new master
 * password and expires soon, because whoever gets here has not yet proven they know
 * any password. See ADR-010.
 */
final readonly class RecoveryResult
{
    /**
     * @param  list<array{vault_id: string, recovery_wrapped_key: string, recovery_wrapped_key_iv: string}>  $wrappedKeys
     */
    public function __construct(
        public User $user,
        public array $wrappedKeys,
        public string $token,
    ) {}
}
