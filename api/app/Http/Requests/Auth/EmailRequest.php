<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class EmailRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Of the current hash only its presence and that it is text are checked, as in
     * MasterPasswordRequest and for the same reason: refusing it on format would give a
     * different error from a hash that does not match, and that difference is
     * information.
     *
     * Of the new email the form IS validated, and there is no dilemma: it is something
     * the user types and a typo there changes the salt of their derivation. What is NOT
     * validated is that it is not already registered, and that is no oversight: that
     * check goes in the controller so it can answer exactly as it does to a wrong
     * password. A `unique` rule would give a 422 with a different message and turn the
     * endpoint into an oracle for enumerating accounts.
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
            'email' => ['required', 'string', 'email', 'max:255'],
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string'],
            'wrapped_keys' => ['required', 'array', 'min:1'],
            'wrapped_keys.*.vault_id' => ['required', 'string'],
            'wrapped_keys.*.wrapped_key' => ['required', 'string'],
            'wrapped_keys.*.wrapped_key_iv' => ['required', 'string'],

            /*
             * The recovery key is optional because not everybody has one: ADR-010
             * decided it is offered and can be declined. Whoever has none sends this
             * empty and nothing happens.
             *
             * Whoever DOES have one has to send it, because changing the email
             * invalidates theirs. That is not checked here but in the service, which is
             * what knows whether there was one: if none arrives, the old wrapper is
             * deleted rather than left as a key that does not open.
             */
            'recovery_auth_hash' => ['nullable', 'string'],
            'recovery_wrapped_keys' => ['nullable', 'array'],
            'recovery_wrapped_keys.*.vault_id' => ['required', 'string'],
            'recovery_wrapped_keys.*.recovery_wrapped_key' => ['required', 'string'],
            'recovery_wrapped_keys.*.recovery_wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
