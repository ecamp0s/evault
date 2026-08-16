<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Verifica una clave de recuperación y entrega lo que solo ella abre. Ver ADR-010.
 *
 * Es el segundo camino a la vault, y hasta esta iteración solo había uno. Todo lo
 * que se aplicó al login se aplica aquí y con más motivo, porque quien llama es por
 * definición alguien que dice haber perdido su contraseña maestra.
 *
 * Lo que devuelve no es una sesión: es el material cifrado que la clave de
 * recuperación abre, más un token que solo sirve para terminar la operación fijando
 * una contraseña maestra nueva.
 */
final readonly class RecoverAccess
{
    public function handle(string $email, string $recoveryAuthHash): RecoveryResult
    {
        $user = User::query()
            ->where('email', mb_strtolower(trim($email)))
            ->first();

        /*
         * Se comprueba el hash SIEMPRE, también cuando el usuario no existe y
         * también cuando existe pero no tiene clave de recuperación. Es el mismo
         * patrón que LoginUser y por el mismo motivo, que aquí pesa más: si salir
         * antes hiciera medible la diferencia, este endpoint diría qué correos
         * están registrados, y además cuáles de ellos tienen segunda llave. Lo
         * segundo es un dato que el login no filtra y que no conviene estrenar.
         *
         * El hash ficticio tiene la forma de uno real para que la comprobación
         * cueste lo mismo.
         */
        $storedHash = '$2y$12$'.str_repeat('0', 53);

        if ($user instanceof User && $user->recovery_auth_hash !== null) {
            $storedHash = $user->recovery_auth_hash;
        }

        if (! Hash::check($recoveryAuthHash, $storedHash)) {
            throw new InvalidRecoveryKey;
        }

        /*
         * Llegar aquí con $user nulo es imposible —el hash ficticio no valida
         * nunca— pero el compilador no lo sabe y una comprobación de más en el
         * camino de autenticación no sobra.
         */
        if (! $user instanceof User) {
            throw new InvalidRecoveryKey;
        }

        $wrappedKeys = [];

        foreach ($user->vaults as $vault) {
            $wrapped = $vault->pivot->recovery_wrapped_key;
            $iv = $vault->pivot->recovery_wrapped_key_iv;

            /*
             * Una vault sin envoltorio de recuperación se omite en vez de romper la
             * respuesta. Puede pasar de verdad: la clave se registró cuando el
             * usuario tenía una vault y después entró en otra, que es un escenario
             * que llegará con las vaults compartidas. Lo que abra, se entrega; lo
             * que no, no se inventa.
             */
            if ($wrapped === null || $iv === null) {
                continue;
            }

            $wrappedKeys[] = [
                'vault_id' => $vault->id,
                'recovery_wrapped_key' => $wrapped,
                'recovery_wrapped_key_iv' => $iv,
            ];
        }

        /*
         * Token de capacidad única y vida corta. No puede leer items ni listar
         * vaults: las rutas normales exigen `*` y este no lo tiene.
         */
        $token = $user->createToken(
            AccessTokens::RECOVERY_NAME,
            [AccessTokens::RECOVERY_ABILITY],
            now()->addMinutes(AccessTokens::RECOVERY_MINUTES),
        )->plainTextToken;

        return new RecoveryResult($user, $wrappedKeys, $token);
    }
}
