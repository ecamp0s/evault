<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Solo se comprueba que los campos vengan y sean del tipo esperado. No se
     * aplica aquí ninguna regla de formato ni de longitud sobre la contraseña:
     * rechazar por formato una credencial incorrecta daría un error distinto al de
     * unas credenciales que no coinciden, y esa diferencia es información.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ];
    }
}
