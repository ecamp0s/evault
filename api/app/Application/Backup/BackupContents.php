<?php

declare(strict_types=1);

namespace App\Application\Backup;

/**
 * What goes into a backup, and why those four tables.
 *
 * The order matters when restoring: the foreign keys demand that the user exist before
 * their vault, and the vault before its members and its items.
 *
 * `vault_members` is NOT optional even though it only holds memberships: the wrapped
 * vault key lives there. Without it, the copy is a pile of ciphertext nobody can open
 * any more, not even with the right master password. It is the difference between a
 * backup and a large file. See ADR-008.
 *
 * What is left out, deliberately: `personal_access_tokens`, because a live session is
 * not data to restore and dragging it along would resurrect tokens that may have been
 * revoked on purpose; and `cache` and `jobs`, which are execution state.
 */
final class BackupContents
{
    /** Version of the file format. Checked when restoring. */
    public const int VERSION = 1;

    /**
     * They are written in this order and restored in this order.
     *
     * @var list<string>
     */
    public const array TABLES = ['users', 'vaults', 'vault_members', 'vault_items'];
}
