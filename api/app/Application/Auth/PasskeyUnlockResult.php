<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;

/**
 * What a successful passkey unlock hands back. See ADR-021.
 *
 * The wrapper travels here and only here: it is the one moment it is needed, and the
 * list of passkeys deliberately never carries it.
 */
final readonly class PasskeyUnlockResult
{
    public function __construct(
        public User $user,
        public string $vaultId,
        public string $wrappedKey,
        public string $wrappedKeyIv,
        public string $token,
    ) {}
}
