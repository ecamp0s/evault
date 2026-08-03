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
     * Aquí sí se valida la forma, al contrario que en RecoverRequest: esto no es un
     * intento de autenticación, así que un error de formato no filtra nada y sí
     * evita escribir basura en las columnas.
     *
     * Lo que no se valida —ni se puede— es que los envoltorios abran de verdad ni
     * que el hash corresponda a la clave que los produjo. Son blobs opacos, y esta
     * es la misma excepción al double guard que ya está registrada para el
     * contenido de los items: el servidor no puede validar lo que no puede leer.
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
