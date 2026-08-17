<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Cambiar el correo electrónico. Ver ADR-014.
 *
 * El correo NO es un dato de perfil: por ADR-008 es el salt del que se derivan la
 * clave maestra y las claves de recuperación. Cambiarlo obliga a re-derivar y a
 * reenvolver, y por eso esto se parece mucho más a RotateMasterPassword que a
 * actualizar un campo.
 *
 * Lo que NO cambia es la clave de vault, y ahí se vuelve a cobrar el dividendo de
 * ADR-008: los items no se tocan, así que la operación cuesta lo mismo con tres
 * entradas que con tres mil.
 */
final readonly class ChangeEmail
{
    /**
     * @param  array<string, WrappedVaultKey>  $wrappedKeys  indexado por vault_id
     * @param  array<string, WrappedVaultKey>  $recoveryWrappedKeys  indexado por vault_id, vacío si no hay
     * @param  int|null  $keepTokenId  el token que sobrevive, si hay alguno
     */
    public function handle(
        int $userId,
        string $newEmail,
        string $newAuthHash,
        array $wrappedKeys,
        ?string $recoveryAuthHash = null,
        array $recoveryWrappedKeys = [],
        ?int $keepTokenId = null,
    ): void {
        /*
         * TODO junto, por lo mismo que en RotateMasterPassword y con un estado a
         * medias más, porque aquí son cuatro escrituras y no tres.
         *
         * El peor de todos es el correo cambiado con los envoltorios viejos: el
         * usuario entra con su correo nuevo, deriva una clave maestra distinta, y esa
         * clave no abre nada. La vault queda cerrada con sus datos dentro y el
         * servidor no puede repararlo, porque no tiene ninguna de las claves.
         *
         * Hay un test que fuerza una excepción entre escrituras y comprueba que no
         * queda nada a medias.
         */
        DB::transaction(function () use (
            $userId,
            $newEmail,
            $newAuthHash,
            $wrappedKeys,
            $recoveryAuthHash,
            $recoveryWrappedKeys,
            $keepTokenId
        ): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            foreach ($wrappedKeys as $vaultId => $wrappedKey) {
                /*
                 * Acotado por user_id siempre: segunda barrera del double guard, que
                 * exige ADR-004. Un vault_id ajeno no escribe nada en vez de escribir
                 * en la fila de otro.
                 */
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->where('vault_id', $vaultId)
                    ->update([
                        'wrapped_key' => $wrappedKey->ciphertext,
                        'wrapped_key_iv' => $wrappedKey->iv,
                    ]);
            }

            /*
             * El envoltorio de recuperación, que es lo que distingue esta operación de
             * una rotación de contraseña.
             *
             * Rotar la contraseña NO toca la clave de recuperación, porque la clave de
             * vault no cambia. Cambiar el correo SÍ la invalida, porque el correo es
             * el salt del HKDF del que salen su clave de envoltura y su hash. Por eso
             * aquí hay que rehacerlo o borrarlo: dejarlo como está sería dejar al
             * usuario con una segunda llave que ya no abre y que él cree que abre.
             *
             * Ver ADR-014 §2.1: quien tenía clave de recuperación recibe una nueva
             * dentro de la misma operación; a quien no la tenía no se le inventa una.
             *
             * Y SI NO LLEGA NINGUNO, EL VIEJO SE BORRA en vez de quedarse. Es la
             * decisión menos obvia de este servicio y la que evita el peor final: un
             * envoltorio que ya no puede abrirse, guardado como si sirviera, y un
             * usuario convencido de que tiene red de seguridad. Sin clave de
             * recuperación se está en el modelo anterior, que ADR-010 considera
             * legítimo; con una que no abre, no se está en ninguno.
             */
            if ($recoveryAuthHash !== null) {
                foreach ($recoveryWrappedKeys as $vaultId => $wrappedKey) {
                    VaultMember::query()
                        ->where('user_id', $userId)
                        ->where('vault_id', $vaultId)
                        ->update([
                            'recovery_wrapped_key' => $wrappedKey->ciphertext,
                            'recovery_wrapped_key_iv' => $wrappedKey->iv,
                        ]);
                }

                $user->recovery_auth_hash = $recoveryAuthHash;
            } else {
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->update([
                        'recovery_wrapped_key' => null,
                        'recovery_wrapped_key_iv' => null,
                    ]);

                $user->recovery_auth_hash = null;
            }

            $user->email = $newEmail;
            // El cast 'hashed' del modelo se encarga; el valor recibido no se guarda.
            $user->password = $newAuthHash;
            $user->save();

            /*
             * Los demás tokens caen, igual que al rotar la contraseña: el correo es
             * parte de las credenciales, y quien lo cambia espera que las sesiones
             * abiertas en otros sitios dejen de valer. El de la petición en curso
             * sobrevive cuando se pasa, porque expulsar a quien acaba de demostrar que
             * sabe la contraseña no protege de nada.
             */
            PersonalAccessToken::query()
                ->where('tokenable_id', $userId)
                ->where('tokenable_type', User::class)
                ->when($keepTokenId !== null, fn ($query) => $query->whereKeyNot($keepTokenId))
                ->delete();
        });
    }
}
