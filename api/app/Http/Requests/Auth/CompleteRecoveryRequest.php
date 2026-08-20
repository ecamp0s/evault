<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class CompleteRecoveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * The same as MasterPasswordRequest minus the current hash, and that absence is the
     * whole difference between the two paths: whoever gets here has lost the master
     * password, so they cannot supply a hash of it. What they have proven is possession
     * of the recovery key, and the endpoint that handed them this token already verified
     * that.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'password' => ['required', 'string'],
            'wrapped_keys' => ['required', 'array', 'min:1'],
            'wrapped_keys.*.vault_id' => ['required', 'string'],
            'wrapped_keys.*.wrapped_key' => ['required', 'string'],
            'wrapped_keys.*.wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
