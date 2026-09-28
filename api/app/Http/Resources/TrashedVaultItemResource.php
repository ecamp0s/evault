<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Application\Vaults\Trash;
use App\Models\VaultItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An item in the bin: the fields of VaultItemResource, enumerated again on purpose,
 * plus when it was deleted and when the purge will take it.
 *
 * purges_at is computed here and not by the client so that the thirty days live in one
 * place (Trash) and a client never has to know them.
 *
 * @mixin VaultItem
 */
final class TrashedVaultItemResource extends JsonResource
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
            'deleted_at' => $this->deleted_at?->toIso8601String(),
            'purges_at' => $this->deleted_at === null ? null : Trash::purgesAt($this->deleted_at)->toIso8601String(),
        ];
    }
}
