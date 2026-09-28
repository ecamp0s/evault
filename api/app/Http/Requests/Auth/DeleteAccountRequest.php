<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Deleting the account: the current authentication hash and the account's email, typed
 * by hand. See ADR-024 §2.1 and §2.5.
 */
final class DeleteAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string'],
            'email' => ['required', 'string'],
        ];
    }
}
