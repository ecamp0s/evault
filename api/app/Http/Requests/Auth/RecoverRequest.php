<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

final class RecoverRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Solo se comprueba que los campos vengan y sean del tipo esperado, igual que
     * en LoginRequest y por el mismo motivo: rechazar por formato una clave de
     * recuperación incorrecta daría un error distinto al de una clave que no
     * coincide, y esa diferencia es información. Ver ADR-010.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string'],
            'recovery_auth_hash' => ['required', 'string'],
        ];
    }
}
