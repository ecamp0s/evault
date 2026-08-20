<?php

declare(strict_types=1);

namespace App\Application\Vaults;

/**
 * An item's opaque content, moving between the presentation layer and the application
 * layer.
 *
 * The three fields always travel together and not for convenience: the ciphertext and
 * its nonce are one datum split across two columns, and the version says how they have
 * to be read. Updating one without the others would produce a row that cannot be
 * decrypted, so the payload is replaced whole or not touched.
 *
 * None of this is interpreted on the server. See docs/architecture/FOUNDATION.md.
 */
final readonly class VaultItemPayload
{
    public function __construct(
        public string $ciphertext,
        public string $iv,
        public int $version,
    ) {}
}
