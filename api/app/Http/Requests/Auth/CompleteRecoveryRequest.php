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
     * Lo mismo que MasterPasswordRequest menos el hash actual, y esa ausencia es la
     * diferencia entera entre los dos caminos: quien llega aquí ha perdido la
     * contraseña maestra, así que no puede aportar un hash de ella. Lo que ha
     * demostrado es la posesión de la clave de recuperación, y eso ya lo verificó el
     * endpoint que le entregó este token.
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
