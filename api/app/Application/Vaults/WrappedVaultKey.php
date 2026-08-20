<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * A vault's key, wrapped with the master key of one of its members.
 *
 * It is VaultItemPayload's counterpart for keys: bytes the client encrypted and the
 * server stores without being able to open them. In the table they are the wrapped_key
 * and wrapped_key_iv columns of vault_members.
 *
 * The two fields always travel together. A ciphertext without its nonce cannot be
 * decrypted, so separating them would allow writing half a key and locking somebody out
 * of their own vault irreversibly.
 *
 * It carries no version, unlike VaultItemPayload. The cryptographic schema's version
 * already travels in each item, which is where it matters for migrating them one at a
 * time; the wrapped key is rewritten whole every time it changes and admits no
 * coexistence of schemas. See ADR-008.
 */
final readonly class WrappedVaultKey
{
    public function __construct(
        public string $ciphertext,
        public string $iv,
    ) {}
}
