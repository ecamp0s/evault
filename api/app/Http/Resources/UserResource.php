<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The public shape of a user. It is part of the API's contract, so adding or removing
 * fields here affects every client.
 *
 * It must never expose password or remember_token. The model already marks them
 * hidden, but this resource enumerates the fields explicitly so that a new attribute
 * does not leak merely by having been added to the table.
 *
 * @mixin User
 */
final class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'created_at' => $this->created_at?->toIso8601String(),
            /*
             * WHETHER THERE IS A RECOVERY KEY, not which one: a boolean derived from
             * the column being set. The hash does not leave here and never would.
             *
             * It exists because the client needs it to do the right thing when changing
             * the email, and cannot deduce it: changing it INVALIDATES the recovery key
             * — the email is the salt of its derivation — so whoever has one must
             * receive another inside the same operation. And whoever has none must not
             * be saddled with an obligation they never took on, which is what ADR-010
             * left as a legitimate and permanent state.
             *
             * Without this field, the screen can only choose between bothering some
             * people or leaving others with a key that no longer opens. See ADR-014
             * §2.1 and #222.
             *
             * It leaks nothing: /auth/me returns the authenticated user their own data,
             * and knowing whether one has a recovery key is the least of it.
             */
            'has_recovery_key' => $this->recovery_auth_hash !== null,
        ];
    }
}
