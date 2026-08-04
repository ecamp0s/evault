<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Support\Facades\DB;

/**
 * Cambia el hash de autenticación y reenvuelve la clave de vault. Ver ADR-008.
 *
 * Es el dividendo que aquel ADR compró al decidir que la clave maestra no cifrara
 * los items sino que envolviera una clave de vault: cambiar la contraseña maestra
 * es reescribir unos pocos bytes, no recifrar la vault entera. Los items no se
 * tocan, así que ni siquiera hay que leerlos.
 *
 * NO verifica quién llama, y es deliberado: este servicio lo usan dos caminos
 * distintos y cada uno demuestra identidad a su manera. El cambio normal comprueba
 * el hash de autenticación actual; la recuperación de ADR-010 llega con un token de
 * un solo uso que ya demostró la posesión de la clave de recuperación, y no puede
 * aportar un hash actual porque justamente lo ha perdido. Poner la verificación
 * aquí obligaría a uno de los dos a fingirla.
 *
 * Lo que sí hace siempre es escribirlo todo junto o no escribir nada.
 */
final readonly class RotateMasterPassword
{
    /**
     * @param  array<string, WrappedVaultKey>  $wrappedKeys  indexado por vault_id
     * @param  int|null  $keepTokenId  el token que sobrevive, si hay alguno
     */
    public function handle(
        int $userId,
        string $newAuthHash,
        array $wrappedKeys,
        ?int $keepTokenId = null,
    ): void {
        /*
         * TODO junto, y es el punto que hace peligroso este servicio.
         *
         * Los dos estados a medias posibles son irreparables desde el servidor, que
         * no tiene ninguna de las claves. Con la contraseña cambiada y el envoltorio
         * viejo, el usuario entra y su clave maestra nueva no abre nada: la vault
         * queda cerrada con sus datos dentro. Con el envoltorio nuevo y la
         * contraseña vieja, ni siquiera entra.
         *
         * Hay un test que fuerza el fallo entre las dos escrituras.
         */
        DB::transaction(function () use ($userId, $newAuthHash, $wrappedKeys, $keepTokenId): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            foreach ($wrappedKeys as $vaultId => $wrappedKey) {
                /*
                 * Acotado por user_id siempre, que es la segunda barrera del double
                 * guard y lo que exige ADR-004. Un vault_id ajeno no escribe nada en
                 * vez de escribir en la fila de otro.
                 */
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->where('vault_id', $vaultId)
                    ->update([
                        'wrapped_key' => $wrappedKey->ciphertext,
                        'wrapped_key_iv' => $wrappedKey->iv,
                    ]);
            }

            // El cast 'hashed' del modelo se encarga; el valor recibido no se guarda.
            $user->password = $newAuthHash;
            $user->save();

            /*
             * Los demás tokens caen. Es media razón de ser de esta operación: quien
             * cambia su contraseña maestra sospechando un robo espera que el otro
             * dispositivo deje de tener acceso, y sin esto seguiría entrando con el
             * token que ya tenía, porque un token vivo no vuelve a mirar la
             * contraseña.
             *
             * El de la petición en curso sobrevive cuando se pasa. Expulsar también
             * a quien acaba de demostrar que sabe la contraseña vieja y ha elegido
             * la nueva no protege de nada, y le obligaría a volver a derivar y a
             * reabrir la vault sin motivo. En la recuperación no se pasa ninguno,
             * porque allí el token es de un solo uso y debe morir aquí.
             */
            PersonalAccessToken::query()
                ->where('tokenable_id', $userId)
                ->where('tokenable_type', User::class)
                ->when($keepTokenId !== null, fn ($query) => $query->whereKeyNot($keepTokenId))
                ->delete();
        });
    }
}
