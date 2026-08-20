<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\VaultItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The public shape of an item. It is part of the API's contract.
 *
 * It returns the blob exactly as it was stored, untouched. The fields are enumerated
 * explicitly so that a new column does not leak merely by having been added to the
 * table, which in this table in particular would be a serious failure.
 *
 * @mixin VaultItem
 */
final class VaultItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'vault_id' => $this->vault_id,
            'ciphertext' => $this->ciphertext,
            'iv' => $this->iv,
            'version' => $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
