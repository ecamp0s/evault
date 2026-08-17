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
     * Del hash actual solo se comprueba que venga y sea texto, igual que en
     * MasterPasswordRequest y por el mismo motivo: rechazarlo por formato daría un
     * error distinto al de un hash que no coincide, y esa diferencia es información.
     *
     * Del correo nuevo SÍ se valida la forma, y no hay dilema: es un dato que el
     * usuario escribe y un error tipográfico ahí cambia el salt de su derivación.
     * Lo que NO se valida es que no esté ya registrado, y eso no es un olvido: esa
     * comprobación va en el controlador para poder responder igual que ante una
     * contraseña incorrecta. Una regla `unique` daría un 422 con un mensaje distinto
     * y convertiría el endpoint en un oráculo de enumeración de cuentas.
     *
     * De los envoltorios se valida la forma, porque ahí un error no filtra nada y
     * evita escribir basura en las columnas. Lo que no se puede validar —ni se
     * intenta— es que abran de verdad: son blobs opacos, y esa es la excepción al
     * double guard que el proyecto ya tiene registrada.
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
             * La clave de recuperación es opcional porque no todo el mundo tiene una:
             * ADR-010 decidió que se ofrece y se puede rechazar. Quien no la tenga
             * manda esto vacío y no pasa nada.
             *
             * Quien SÍ la tenga tiene que mandarlo, porque cambiar el correo invalida
             * la suya. Eso no se comprueba aquí sino en el servicio, que es quien sabe
             * si había una: si no llega, el envoltorio viejo se borra en vez de quedar
             * como una llave que no abre.
             */
            'recovery_auth_hash' => ['nullable', 'string'],
            'recovery_wrapped_keys' => ['nullable', 'array'],
            'recovery_wrapped_keys.*.vault_id' => ['required', 'string'],
            'recovery_wrapped_keys.*.recovery_wrapped_key' => ['required', 'string'],
            'recovery_wrapped_keys.*.recovery_wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
