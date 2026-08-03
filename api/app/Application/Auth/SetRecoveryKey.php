<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultMember;
use Illuminate\Support\Facades\DB;

/**
 * Registra o sustituye la clave de recuperación de un usuario. Ver ADR-010.
 *
 * Sirve para las dos operaciones porque son la misma escritura: generar por primera
 * vez y regenerar solo se diferencian en si había algo antes. Al terminar, la clave
 * de recuperación anterior deja de servir.
 *
 * Recibe el identificador por parámetro y no toca la sesión, siguiendo ADR-004.
 *
 * El servidor no puede validar nada de lo que llega: ni que los envoltorios abran
 * de verdad, ni que el hash corresponda a la clave que los envolvió. Son blobs
 * opacos, igual que wrapped_key y que ciphertext. Lo único que comprueba es que se
 * escriba sobre vaults de las que el usuario es miembro.
 */
final readonly class SetRecoveryKey
{
    /**
     * @param  array<string, WrappedVaultKey>  $wrappedKeys  indexado por vault_id
     */
    public function handle(int $userId, string $recoveryAuthHash, array $wrappedKeys): void
    {
        /*
         * Todo dentro de una transacción, y es el punto delicado de este servicio.
         *
         * Escribir el hash sin los envoltorios deja a alguien que se autentica con
         * su clave de recuperación y después no puede abrir nada. Escribir los
         * envoltorios sin el hash deja lo contrario. Los dos estados son una
         * recuperación que no funciona, y lo peor de esa clase de fallo es que no
         * se descubre hasta el día en que hace falta, cuando ya no hay otra vía.
         *
         * Hay un test que fuerza el fallo entre las dos escrituras y comprueba que
         * no queda nada a medias.
         */
        DB::transaction(function () use ($userId, $recoveryAuthHash, $wrappedKeys): void {
            $user = User::query()->lockForUpdate()->findOrFail($userId);

            foreach ($wrappedKeys as $vaultId => $wrappedKey) {
                /*
                 * Acotado por user_id, siempre. Es la barrera que impide escribir
                 * en la fila de otro pasando su vault_id, y es obligatoria por
                 * ADR-004: toda query que toque datos de usuario lleva su acotado.
                 *
                 * update() devuelve el número de filas afectadas, así que un
                 * vault_id ajeno o inexistente no escribe nada y no revienta. El
                 * controlador ya ha comprobado la pertenencia; esto es el segundo
                 * guard.
                 */
                VaultMember::query()
                    ->where('user_id', $userId)
                    ->where('vault_id', $vaultId)
                    ->update([
                        'recovery_wrapped_key' => $wrappedKey->ciphertext,
                        'recovery_wrapped_key_iv' => $wrappedKey->iv,
                    ]);
            }

            // El cast 'hashed' del modelo se encarga de hashear, igual que con
            // password. El valor que llegó no se guarda nunca.
            $user->recovery_auth_hash = $recoveryAuthHash;
            $user->save();
        });
    }
}
