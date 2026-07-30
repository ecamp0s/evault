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
             * Longitud mínima y nada más. Deliberado: en la Iteración 3 este campo
             * dejará de ser una contraseña y pasará a ser un hash de autenticación
             * derivado en el cliente, y unas reglas de composición pensadas para
             * texto escrito por humanos estorbarían entonces. La fortaleza real de
             * la contraseña maestra se validará en el cliente, que es donde se
             * conoce. Ver ADR-001.
             */
            'password' => ['required', 'string', Password::min(8), 'max:255'],
        ];
    }
}
