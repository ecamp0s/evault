<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\PasskeyFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A passkey that opens a vault without the master password. See ADR-021.
 *
 * WHAT THE SERVER CAN DO WITH THIS ROW IS ALMOST NOTHING, and that is the point. The
 * wrapper is opaque bytes, like an item's ciphertext; the hash is stored hashed and
 * only ever compared; and there is no public key here because nothing verifies a
 * signature — the server does not know this is WebAuthn, and ADR-021 §2.4 argues why
 * it does not need to.
 *
 * The label and rp_id are the exception and are metadata in the clear: what the person
 * called this passkey and which hostname it belongs to. That cost is accepted in
 * ADR-021 §5.2, and the screen says so rather than implying they are private.
 *
 * @property string $id
 * @property int $user_id
 * @property string $vault_id
 * @property string $credential_id
 * @property string $label
 * @property string $rp_id
 * @property string $auth_hash
 * @property string $wrapped_key
 * @property string $wrapped_key_iv
 * @property Carbon|null $last_used_at
 */
class Passkey extends Model
{
    /** @use HasFactory<PasskeyFactory> */
    use HasFactory, HasUuids;

    protected $fillable = [
        'vault_id',
        'credential_id',
        'label',
        'rp_id',
        'auth_hash',
        'wrapped_key',
        'wrapped_key_iv',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            /*
             * Hashed like the ordinary authentication hash and like the recovery one:
             * the server never stores the value it received. It is what makes a stolen
             * database useless for unlocking, and it is the reason lookups walk the
             * account's passkeys instead of querying by this column.
             */
            'auth_hash' => 'hashed',
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Vault, $this>
     */
    public function vault(): BelongsTo
    {
        return $this->belongsTo(Vault::class);
    }
}
