<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Application\Vaults\VaultSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The public shape of a vault. It is part of the API's contract.
 *
 * It wraps a VaultSummary and not the model, because the role exposed here does not
 * live in the vaults table but in the membership one.
 *
 * @mixin VaultSummary
 */
final class VaultResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            // A derived boolean: in the database, being personal is a relation and not
            // a column. See docs/architecture/FOUNDATION.md.
            'is_personal' => $this->isPersonal,
            'role' => $this->role->value,
            /*
             * The key this user opens this vault with, wrapped. It goes here and not in
             * the login response because it belongs to the vault and not to the session,
             * and because this way the contract of /api/auth does not change: this is
             * the endpoint that exists to discover the context. See ADR-008.
             */
            'wrapped_key' => $this->wrappedKey->ciphertext,
            'wrapped_key_iv' => $this->wrappedKey->iv,
        ];
    }
}
