<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Application\Auth\SessionClient;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Only that the fields arrive and are of the expected type is checked. No rule of
     * format or length is applied to the password here: refusing a wrong credential on
     * format would give a different error from credentials that do not match, and that
     * difference is information.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
            // Which client asks, from a closed list (#711). Optional, so that a build
            // from before it keeps working; see SessionClient.
            'client' => ['sometimes', Rule::enum(SessionClient::class)],
        ];
    }
}
