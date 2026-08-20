<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class RecoverRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Only that the fields arrive and are of the expected type is checked, as in
     * LoginRequest and for the same reason: refusing a wrong recovery key on format
     * would give a different error from a key that does not match, and that difference
     * is information. See ADR-010.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string'],
            'recovery_auth_hash' => ['required', 'string'],
        ];
    }
}
