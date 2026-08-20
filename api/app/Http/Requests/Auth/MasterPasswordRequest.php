<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class MasterPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Of the current hash only its presence and that it is text are checked, as in
     * LoginRequest and for the same reason: refusing it on format would give a different
     * error from a hash that does not match, and that difference is information.
     *
     * Of the wrappers the form is validated, because an error there leaks nothing and
     * avoids writing rubbish into the columns. What cannot be validated — and is not
     * attempted — is that they really open: they are opaque blobs, and that is the
     * exception to the double guard the project already has on record.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string'],
            'wrapped_keys' => ['required', 'array', 'min:1'],
            'wrapped_keys.*.vault_id' => ['required', 'string'],
            'wrapped_keys.*.wrapped_key' => ['required', 'string'],
            'wrapped_keys.*.wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
