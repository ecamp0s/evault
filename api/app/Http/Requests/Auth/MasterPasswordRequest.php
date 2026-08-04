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
     * Del hash actual solo se comprueba que venga y sea texto, igual que en
     * LoginRequest y por el mismo motivo: rechazarlo por formato daría un error
     * distinto al de un hash que no coincide, y esa diferencia es información.
     *
     * De los envoltorios sí se valida la forma, porque ahí un error no filtra nada
     * y evita escribir basura en las columnas. Lo que no se puede validar —ni se
     * intenta— es que abran de verdad: son blobs opacos, y esa es la excepción al
     * double guard que el proyecto ya tiene registrada.
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
