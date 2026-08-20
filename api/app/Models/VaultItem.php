<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\VaultItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A vault entry, as far as the server is concerned: some bytes it cannot read, the
 * nonce they were encrypted with and the version of the cryptographic schema.
 *
 * This model has no methods that interpret the content and never will. If some server
 * feature ends up needing that, what gets redesigned is the feature. See ADR-001 and
 * docs/architecture/FOUNDATION.md.
 *
 * @property string $id
 * @property string $vault_id
 * @property string $ciphertext
 * @property string $iv
 * @property int $version
 */
#[Fillable(['vault_id', 'ciphertext', 'iv', 'version'])]
class VaultItem extends Model
{
    /** @use HasFactory<VaultItemFactory> */
    use HasFactory, HasUuids;

    /**
     * @return BelongsTo<Vault, $this>
     */
    public function vault(): BelongsTo
    {
        return $this->belongsTo(Vault::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'version' => 'integer',
        ];
    }
}
