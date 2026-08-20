<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class RecoveryKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Here the form IS validated, unlike in RecoverRequest: this is not an
     * authentication attempt, so a format error leaks nothing and does avoid writing
     * rubbish into the columns.
     *
     * What is not validated — and cannot be — is that the wrappers really open, nor that
     * the hash belongs to the key that produced them. They are opaque blobs, and this is
     * the same exception to the double guard already on record for the content of the
     * items: the server cannot validate what it cannot read.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'recovery_auth_hash' => ['required', 'string'],
            'wrapped_keys' => ['required', 'array', 'min:1'],
            'wrapped_keys.*.vault_id' => ['required', 'string'],
            'wrapped_keys.*.recovery_wrapped_key' => ['required', 'string'],
            'wrapped_keys.*.recovery_wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
