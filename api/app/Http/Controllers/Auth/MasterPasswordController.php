<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\InvalidCredentials;
use App\Application\Auth\RotateMasterPassword;
use App\Application\Vaults\VaultNotAccessible;
use App\Application\Vaults\WrappedVaultKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\MasterPasswordRequest;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;

/**
 * Cambio de contraseña maestra. Ver ADR-008.
 *
 * Aquí vive lo único que este camino no comparte con la recuperación de ADR-010:
 * la comprobación de que quien pide el cambio sabe la contraseña que hay. El
 * reenvolvido y la escritura los hace el servicio, que es el mismo para los dos.
 */
final class MasterPasswordController extends Controller
{
    public function update(
        MasterPasswordRequest $request,
        RotateMasterPassword $rotateMasterPassword,
    ): Response {
        $user = $this->authenticatedUser($request);

        /*
         * No basta con que la sesión sea válida. Un token robado abriría la puerta a
         * cambiar la contraseña maestra y dejar fuera al dueño, así que se exige
         * demostrar que se sabe la actual.
         *
         * Es la misma excepción que InvalidCredentials usa en el login, y con el
         * mismo mensaje: no hay nada que distinguir aquí, quien falla es quien no
         * sabe la contraseña.
         */
        if (! Hash::check($request->string('current_password')->toString(), $user->password)) {
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
         * Se exige reenvolver TODAS las vaults del usuario, no las que quiera
         * mandar. Dejarse una fuera la deja envuelta con una clave maestra que ya
         * no existe, y eso no se ve hasta que alguien intenta abrirla.
         */
        if (count($wrappedKeys) !== count($own)) {
            throw new VaultNotAccessible;
        }

        /*
         * El token de esta petición sobrevive; los demás dispositivos no.
         *
         * Se comprueba el VALOR y no el tipo, aunque el tipo parezca suficiente: un
         * token que no viene de la base de datos —el que fabrica actingAs en los
         * tests— es igualmente un PersonalAccessToken, pero sin fila detrás, y leer
         * su identificador devuelve false en vez de null. Quedarse con el instanceof
         * dejaba pasar ese false hasta la firma del servicio.
         *
         * Sin identificador se caen todos los tokens, que es lo correcto cuando no
         * hay ninguna sesión concreta que conservar.
         */
        $currentTokenId = $user->currentAccessToken()->id ?? null;

        $rotateMasterPassword->handle(
            userId: $user->id,
            newAuthHash: $request->string('password')->toString(),
            wrappedKeys: $wrappedKeys,
            keepTokenId: is_int($currentTokenId) ? $currentTokenId : null,
        );

        return response()->noContent();
    }
}
