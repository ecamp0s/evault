<?php

declare(strict_types=1);

namespace App\Application\Backup;

/**
 * What goes into a backup, and why those five tables.
 *
 * The order matters when restoring: the foreign keys demand that the user exist before
 * their vault, and the vault before its members, its items and its passkeys.
 *
 * `vault_members` is NOT optional even though it only holds memberships: the wrapped
 * vault key lives there. Without it, the copy is a pile of ciphertext nobody can open
 * any more, not even with the right master password. It is the difference between a
 * backup and a large file. See ADR-008.
 *
 * `passkeys` is here for the same reason and by the same argument, one wrapper further
 * along. ADR-021 §7 says it out loud because THIS LIST IS EXPLICIT AND A NEW TABLE DOES
 * NOT JOIN IT ON ITS OWN: a restore that left it out would come back with a vault that
 * opens with the master password and not with the face, and nobody would find out until
 * the day they tried.
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
    public const array TABLES = [
        'users',
        'vaults',
        'vault_members',
        'vault_items',
        'passkeys',
    ];
}
