<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\CreatePersonalVault;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Alta de un usuario, creación de su vault personal y emisión de su primer token.
 *
 * Aviso sobre el modelo de seguridad de esta iteración: la contraseña llega en
 * claro y la hashea el servidor. No es zero-knowledge y se sustituye en la
 * Iteración 3, cuando lo que viaje sea un hash de autenticación derivado en el
 * cliente. Lo que no debe cambiar entonces es la forma de esta llamada, porque el
 * contrato de la API se mantiene estable. Ver ADR-001.
 */
final readonly class RegisterUser
{
    public function __construct(private CreatePersonalVault $createPersonalVault) {}

    public function handle(string $name, string $email, string $password): AuthResult
    {
        $email = mb_strtolower(trim($email));

        return DB::transaction(function () use ($name, $email, $password): AuthResult {
            // Double guard: el Form Request ya aplicó la regla unique, pero entre
            // aquella consulta y este insert cabe otra petición con el mismo correo.
            // lockForUpdate cierra esa ventana dentro de la transacción.
            if (User::query()->where('email', $email)->lockForUpdate()->exists()) {
                throw new EmailAlreadyRegistered;
            }

            $user = User::query()->create([
                'name' => trim($name),
                'email' => $email,
                // El cast 'hashed' del modelo se encarga de hashear.
                'password' => $password,
            ]);

            /*
             * Dentro de la misma transacción, y a propósito: el resto de la
             * Iteración 2 da por hecho que todo usuario tiene un vault. Si esto
             * falla, preferimos no tener usuario a tener uno inservible al que
             * habría que reparar a mano.
             */
            $this->createPersonalVault->handle($user->id);

            return new AuthResult($user, $user->createToken(AccessTokens::NAME)->plainTextToken);
        });
    }
}
