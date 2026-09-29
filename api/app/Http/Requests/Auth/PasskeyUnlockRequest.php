<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Application\Auth\SessionClient;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class PasskeyUnlockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * The form is NOT validated beyond both fields being present, and it is the same
     * exception RecoverRequest already carries: this is an authentication attempt, so
     * every answer that is not «it did not work» tells whoever is trying something.
     *
     * In particular the email is not checked to be well formed. A 422 saying «that is
     * not an email» and a 401 saying nothing are two different answers, and the
     * difference is measurable from outside.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string'],
            'auth_hash' => ['required', 'string'],
            // Which client asks, from a closed list (#711). Optional, so that a build
            // from before it keeps working; see SessionClient.
            'client' => ['sometimes', Rule::enum(SessionClient::class)],
            // The token this session replaces, from a tab unlocking after a reload (#725).
            'replaces' => ['sometimes', 'integer', 'min:1'],
        ];
    }
}
