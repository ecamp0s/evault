<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\VaultFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The product's tenant: a container of secrets with its members. See ADR-004.
 *
 * The identifier is a UUIDv7, which HasUuids generates ordered by time, so the index
 * behaves like a sequential one without being one to the outside world. The timestamp
 * it carries inside adds no leak, because created_at is already in the clear in the
 * same row.
 *
 * @property string $id
 * @property string $name
 * @property int|null $personal_for_user_id
 * @property VaultMember $pivot when the vault is reached through the membership
 */
#[Fillable(['name', 'personal_for_user_id'])]
class Vault extends Model
{
    /** @use HasFactory<VaultFactory> */
    use HasFactory, HasUuids;

    /**
     * The vault's members, with their role and their wrapped key in the pivot.
     *
     * The wrapped key is declared here because without withPivot it does not arrive,
     * and what does not arrive cannot be returned: it is the datum each member opens
     * this vault with. See ADR-008.
     *
     * @return BelongsToMany<User, $this, VaultMember, 'pivot'>
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'vault_members')
            ->using(VaultMember::class)
            ->withPivot('role', 'wrapped_key', 'wrapped_key_iv')
            ->withTimestamps();
    }

    /**
     * The entries it holds. The server can read none of them.
     *
     * @return HasMany<VaultItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(VaultItem::class);
    }

    /**
     * The user this vault is the personal one of, if it is anybody's.
     *
     * @return BelongsTo<User, $this>
     */
    public function personalFor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'personal_for_user_id');
    }

    /**
     * Being personal is not a boolean column but the existence of that relation. The
     * clients receive it as a derived boolean.
     */
    public function isPersonal(): bool
    {
        return $this->personal_for_user_id !== null;
    }
}
