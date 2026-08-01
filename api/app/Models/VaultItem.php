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
 * Una entrada de la vault, para el servidor: unos bytes que no puede leer, el
 * nonce con que se cifraron y la versión del esquema criptográfico.
 *
 * Este modelo no tiene ni tendrá métodos que interpreten el contenido. Si alguna
 * funcionalidad del servidor llega a necesitarlo, lo que se rediseña es la
 * funcionalidad. Ver ADR-001 y docs/architecture/FOUNDATION.md.
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
