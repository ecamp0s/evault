<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\CreatePersonalVault;
use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Alta de un usuario, creación de su vault personal y emisión de su primer token.
 *
 * Sobre el campo $password: desde la Iteración 3 lo que llega ya no es la
 * contraseña del usuario sino el hash de autenticación que el cliente derivó de
 * ella, y el servidor lo trata igual que antes porque para él sigue siendo una
 * cadena que hashear. Esa continuidad es justo lo que ADR-001 pedía conservar al
 * exigir que el contrato se mantuviera estable desde la Iteración 1.
 *
 * La contraseña maestra no llega aquí, ni a ningún otro sitio del servidor.
 *
 * La clave envuelta llega junto al alta y no en una llamada aparte porque un
 * usuario con vault y sin clave envuelta no puede abrir nada, así que las dos cosas
 * tienen que nacer o fallar juntas. Ver ADR-008.
 */
final readonly class RegisterUser
{
    public function __construct(
        private CreatePersonalVault $createPersonalVault,
        private IssueSessionToken $issueSessionToken,
    ) {}

    public function handle(
        string $name,
        string $email,
        string $password,
        WrappedVaultKey $wrappedKey,
    ): AuthResult {
        /*
         * La misma normalización que aplica el cliente antes de derivar. No es una
         * cortesía: el correo es el salt de la derivación, así que si las dos
         * normalizaciones dejaran de coincidir, el usuario obtendría otro hash de
         * autenticación al entrar y no podría. Ver ADR-008.
         */
        $email = EmailAddress::normalize($email);

        return DB::transaction(function () use ($name, $email, $password, $wrappedKey): AuthResult {
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
             * Dentro de la misma transacción, y a propósito: el resto del proyecto
             * da por hecho que todo usuario tiene un vault. Si esto falla,
             * preferimos no tener usuario a tener uno inservible al que habría que
             * reparar a mano. Desde ADR-008 el argumento es más fuerte todavía: sin
             * la clave envuelta que se escribe aquí, la cuenta no puede abrir nada
             * y no hay forma de repararla, porque la clave está en el dispositivo
             * de quien se registró y en ningún otro sitio.
             */
            $this->createPersonalVault->handle($user->id, $wrappedKey);

            return new AuthResult($user, $this->issueSessionToken->handle($user));
        });
    }
}
