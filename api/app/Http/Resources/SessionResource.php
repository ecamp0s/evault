<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Application\Auth\SessionSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * An open session. The fields are enumerated so that nothing of the token row —its hash
 * above all— can leak by being added to it.
 *
 * @mixin SessionSummary
 */
final class SessionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client' => $this->client,
            'created_at' => $this->createdAt?->toIso8601String(),
            'last_used_at' => $this->lastUsedAt?->toIso8601String(),
            'expires_at' => $this->expiresAt?->toIso8601String(),
            'current' => $this->current,
        ];
    }
}
