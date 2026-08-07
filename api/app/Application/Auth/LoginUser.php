<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Verificación de credenciales y emisión de un token nuevo.
 *
 * No toca la sesión ni ningún guard con estado: la API es stateless y el token es
 * la única credencial. Ver ADR-004.
 */
final readonly class LoginUser
{
    public function __construct(private IssueSessionToken $issueSessionToken) {}

    public function handle(string $email, string $password): AuthResult
    {
        $user = User::query()
            ->where('email', mb_strtolower(trim($email)))
            ->first();

        /*
         * Se comprueba el hash incluso cuando el usuario no existe, contra un hash
         * ficticio. Si se saliera antes, la respuesta a un correo no registrado
         * sería medible más rápida que la de uno registrado con contraseña
         * incorrecta, y esa diferencia permite enumerar cuentas.
         */
        if ($user === null) {
            Hash::check($password, '$2y$12$'.str_repeat('0', 53));

            throw new InvalidCredentials;
        }

        if (! Hash::check($password, $user->password)) {
            throw new InvalidCredentials;
        }

        return new AuthResult($user, $this->issueSessionToken->handle($user));
    }
}
