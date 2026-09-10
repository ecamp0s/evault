<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Passkey;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The public shape of a passkey. It is part of the API's contract.
 *
 * WHAT IS NOT HERE IS THE POINT: neither the wrapper nor the authentication hash. The
 * wrapper only travels at the moment of unlocking, in the response of
 * POST /api/auth/passkey, and the hash never travels at all — it is stored hashed and
 * only ever compared.
 *
 * The second guard for that lives in ListPasskeys, which does not even read those
 * columns. Two barriers, because a list that leaked a wrapper would hand out one of the
 * three ways into the vault to anybody holding a session token.
 *
 * `rp_id` is here on purpose, and it is not decoration: without it the screen cannot
 * tell somebody which hostname a passkey belongs to, and «it disappeared» is the worst
 * thing a vault can say. See #578.
 *
 * @mixin Passkey
 */
final class PasskeyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'rp_id' => $this->rp_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'last_used_at' => $this->last_used_at?->toIso8601String(),
        ];
    }
}
