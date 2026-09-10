<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class PasskeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * The form IS validated, for the same reason as in RecoveryKeyRequest: this is not
     * an authentication attempt, so a format error leaks nothing and does keep rubbish
     * out of the columns.
     *
     * What is NOT validated, and cannot be: that the wrapper really opens, that the hash
     * came from the PRF that produced it, or that any of this came from a real
     * authenticator. Opaque blobs, the same exception already on record for the items.
     *
     * The label is capped because it is metadata in the clear that the server stores and
     * hands back; the wrapper is not, because a format in the client decides its size,
     * exactly as with wrapped_key.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'vault_id' => ['required', 'string'],
            'credential_id' => ['required', 'string', 'max:512'],
            'label' => ['required', 'string', 'max:60'],
            'rp_id' => ['required', 'string', 'max:255'],
            'auth_hash' => ['required', 'string'],
            'wrapped_key' => ['required', 'string'],
            'wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
