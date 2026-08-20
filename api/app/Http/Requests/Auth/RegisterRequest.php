<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * First barrier of the double guard over the sign-up. The second lives in
 * App\Application\Auth\RegisterUser, which checks the uniqueness of the email again
 * inside the transaction.
 */
final class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:255', 'unique:users,email'],
            /*
             * A minimum length and nothing more, and now it is clear why: since
             * Iteration 3 this field is no longer a password but the authentication
             * hash the client derived, so any composition rule meant for text written
             * by humans would refuse perfectly valid values. The real strength of the
             * master password is validated in the client, the only place it is known.
             * See ADR-001 and ADR-008.
             */
            'password' => ['required', 'string', Password::min(8), 'max:255'],

            /*
             * The vault's key, wrapped with the user's master key. The server can
             * validate no more than its presence and its shape: opening it would take
             * the master password, which does not reach here and must not.
             *
             * Both are mandatory. A sign-up with no wrapped key would produce an
             * account with a vault its owner cannot open, and that is not repaired
             * afterwards: the key lived on the device of whoever signed up.
             *
             * No length ceiling: the size is decided by a format in the client, and
             * putting a maximum here would be the server opining on cryptography it
             * cannot run. It is the same criterion that already governs an item's
             * ciphertext.
             */
            'wrapped_key' => ['required', 'string'],
            'wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
