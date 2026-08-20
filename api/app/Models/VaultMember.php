<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * The membership row between a user and a vault.
 *
 * It exists mostly so that the role arrives typed as VaultRole instead of as a loose
 * string when read through the relation. Writes are still done with attach() over the
 * relation.
 *
 * A warning: the table has a composite primary key, so the Eloquent methods that
 * assume a single key — find, whereKey and company — are no use here. To look
 * something up, filter by vault_id and user_id.
 *
 * It also carries the vault's key wrapped with this member's master key. The server
 * cannot open it and has no need to: it treats it like an item's ciphertext, opaque
 * bytes coming and going. See ADR-008.
 *
 * It may also carry a second wrapper of the SAME vault key, this time with this
 * member's recovery key. It is optional: whoever does not want a second key goes
 * without, and that is why those two columns are nullable while wrapped_key is not.
 * See ADR-010.
 *
 * @property VaultRole $role
 * @property string $wrapped_key
 * @property string $wrapped_key_iv
 * @property string|null $recovery_wrapped_key
 * @property string|null $recovery_wrapped_key_iv
 */
class VaultMember extends Pivot
{
    protected $table = 'vault_members';

    public $incrementing = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => VaultRole::class,
        ];
    }
}
