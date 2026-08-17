<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\ChangeEmail;
use App\Application\Auth\EmailAddress;
use App\Application\Auth\InvalidCredentials;
use App\Application\Vaults\VaultNotAccessible;
use App\Application\Vaults\WrappedVaultKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\EmailRequest;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;

/**
 * Cambio de correo electrónico. Ver ADR-014.
 *
 * El correo es el salt de la derivación (ADR-008), así que esto no actualiza un
 * campo: re-deriva. La comprobación de que quien lo pide sabe la contraseña actual
 * vive aquí, igual que en el cambio de contraseña maestra; el reenvolvido y las
 * escrituras los hace el servicio.
 */
final class EmailController extends Controller
{
    public function update(EmailRequest $request, ChangeEmail $changeEmail): Response
    {
        $user = $this->authenticatedUser($request);

        /*
         * No basta con que la sesión sea válida. Un token robado no puede servir para
         * cambiar el correo y dejar fuera al dueño, así que se exige demostrar que se
         * sabe la contraseña maestra actual.
         */
        if (! Hash::check($request->string('current_password')->toString(), $user->password)) {
            throw new InvalidCredentials;
        }

        $newEmail = EmailAddress::normalize($request->string('email')->toString());

        /*
         * EL CORREO YA REGISTRADO RESPONDE COMO UNA CONTRASEÑA INCORRECTA, y es
         * deliberado: si respondiera distinto, cualquiera con una sesión podría
         * averiguar qué correos existen en la instancia probándolos de uno en uno.
         *
         * Es el mismo cuidado que ADR-008 tuvo al descartar el endpoint de prelogin y
         * que #126 tuvo en el de recuperación. Hay un test que COMPARA las dos
         * respuestas en vez de comprobar cada una por su lado, que es la única forma
         * de que esto no se rompa sin que nadie se entere.
         *
         * El propio correo no cuenta como ocupado: cambiar a lo que ya se tiene es una
         * operación sin efecto, no un conflicto.
         */
        $taken = User::query()
            ->where('email', $newEmail)
            ->whereKeyNot($user->id)
            ->exists();

        if ($taken) {
            throw new InvalidCredentials;
        }

        /** @var list<array{vault_id: string, wrapped_key: string, wrapped_key_iv: string}> $entries */
        $entries = $request->array('wrapped_keys');

        /*
         * Primera barrera del double guard: todas las vaults tienen que ser suyas
         * antes de escribir ninguna. La segunda vive en el servicio, que acota cada
         * escritura por user_id.
         */
        $own = $user->vaults()->pluck('vaults.id')->all();
        $wrappedKeys = [];

        foreach ($entries as $entry) {
            if (! in_array($entry['vault_id'], $own, strict: true)) {
                // 404 y no 403, igual que en el resto del proyecto: un 403
                // confirmaría que el identificador existe.
                throw new VaultNotAccessible;
            }

            $wrappedKeys[$entry['vault_id']] = new WrappedVaultKey(
                ciphertext: $entry['wrapped_key'],
                iv: $entry['wrapped_key_iv'],
            );
        }

        /*
         * Se exige reenvolver TODAS las vaults, no las que se quiera mandar. Dejarse
         * una fuera la deja envuelta con una clave maestra derivada de un correo que
         * ya no existe, y eso no se ve hasta que alguien intenta abrirla.
         */
        if (count($wrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        /** @var list<array{vault_id: string, recovery_wrapped_key: string, recovery_wrapped_key_iv: string}> $recoveryEntries */
        $recoveryEntries = $request->array('recovery_wrapped_keys');
        $recoveryWrappedKeys = [];

        foreach ($recoveryEntries as $entry) {
            if (! in_array($entry['vault_id'], $own, strict: true)) {
                throw new VaultNotAccessible;
            }

            $recoveryWrappedKeys[$entry['vault_id']] = new WrappedVaultKey(
                ciphertext: $entry['recovery_wrapped_key'],
                iv: $entry['recovery_wrapped_key_iv'],
            );
        }

        $recoveryAuthHash = $request->string('recovery_auth_hash')->toString();

        // El mismo criterio que arriba: o se rehacen todos los envoltorios de
        // recuperación o no se rehace ninguno.
        if ($recoveryAuthHash !== '' && count($recoveryWrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        // Ver el comentario de MasterPasswordController sobre por qué se comprueba el
        // valor y no el tipo: actingAs fabrica un token sin fila detrás.
        $currentTokenId = $user->currentAccessToken()->id ?? null;

        $changeEmail->handle(
            userId: $user->id,
            newEmail: $newEmail,
            newAuthHash: $request->string('password')->toString(),
            wrappedKeys: $wrappedKeys,
            recoveryAuthHash: $recoveryAuthHash !== '' ? $recoveryAuthHash : null,
            recoveryWrappedKeys: $recoveryWrappedKeys,
            keepTokenId: is_int($currentTokenId) ? $currentTokenId : null,
        );

        return response()->noContent();
    }
}
