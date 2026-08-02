<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Primera barrera del double guard sobre el alta. La segunda vive en
 * App\Application\Auth\RegisterUser, que vuelve a comprobar la unicidad del correo
 * dentro de la transacción.
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
             * Longitud mínima y nada más, y ahora se ve por qué: desde la Iteración
             * 3 este campo ya no es una contraseña sino el hash de autenticación
             * que el cliente derivó, así que cualquier regla de composición pensada
             * para texto escrito por humanos rechazaría valores perfectamente
             * válidos. La fortaleza real de la contraseña maestra se valida en el
             * cliente, que es el único sitio donde se conoce. Ver ADR-001 y ADR-008.
             */
            'password' => ['required', 'string', Password::min(8), 'max:255'],

            /*
             * La clave de la vault, envuelta con la clave maestra del usuario. El
             * servidor no puede validar más que su presencia y su forma: abrirla
             * exigiría la contraseña maestra, que no llega hasta aquí ni debe.
             *
             * Obligatorias las dos. Un registro sin clave envuelta produciría una
             * cuenta con vault que su dueño no puede abrir, y eso no se repara
             * después: la clave vivía en el dispositivo de quien se registró.
             *
             * Sin techo de longitud: el tamaño lo decide un formato del cliente, y
             * ponerle un máximo aquí sería el servidor opinando sobre criptografía
             * que no puede ejecutar. Es el mismo criterio que ya rige para el
             * ciphertext de un item.
             */
            'wrapped_key' => ['required', 'string'],
            'wrapped_key_iv' => ['required', 'string'],
        ];
    }
}
