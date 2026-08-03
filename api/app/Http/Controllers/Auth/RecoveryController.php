<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Application\Auth\RecoverAccess;
use App\Application\Auth\SetRecoveryKey;
use App\Application\Vaults\VaultNotAccessible;
use App\Application\Vaults\WrappedVaultKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RecoverRequest;
use App\Http\Requests\Auth\RecoveryKeyRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Los dos endpoints de la clave de recuperación. Ver ADR-010.
 *
 * Van en un controlador propio y no en AuthController porque no son parte del ciclo
 * de sesión: uno se usa una vez al configurar la cuenta y el otro solo el día que
 * algo ha ido mal.
 *
 * Aquí no hay lógica, como en el resto de controladores del proyecto: se traduce la
 * petición a una llamada al servicio de aplicación y el resultado a JSON.
 */
final class RecoveryController extends Controller
{
    /**
     * Registra o sustituye la clave de recuperación del usuario autenticado.
     *
     * Exige sesión normal, es decir, alguien que acaba de demostrar que sabe su
     * contraseña maestra. No basta con el token de recuperación: quien llega con
     * ese todavía no ha demostrado saber ninguna contraseña, y dejarle rotar la
     * segunda llave convertiría un robo del papel en una expulsión del dueño.
     */
    public function store(RecoveryKeyRequest $request, SetRecoveryKey $setRecoveryKey): Response
    {
        $user = $this->authenticatedUser($request);

        /** @var list<array{vault_id: string, recovery_wrapped_key: string, recovery_wrapped_key_iv: string}> $entradas */
        $entradas = $request->array('wrapped_keys');

        /*
         * Primera barrera del double guard: se comprueba que todas las vaults sean
         * suyas ANTES de escribir ninguna. La segunda vive en el servicio, que acota
         * cada escritura por user_id.
         *
         * Se comprueban todas antes y no una a una sobre la marcha porque el
         * servicio escribe dentro de una transacción: fallar a mitad la abortaría,
         * pero es más honesto rechazar la petición entera sin haber empezado.
         */
        $suyas = $user->vaults()->pluck('vaults.id')->all();

        $wrappedKeys = [];

        foreach ($entradas as $entrada) {
            if (! in_array($entrada['vault_id'], $suyas, strict: true)) {
                /*
                 * 404 y no 403, igual que en el resto del proyecto: un 403
                 * confirmaría que el identificador existe.
                 */
                throw new VaultNotAccessible;
            }

            $wrappedKeys[$entrada['vault_id']] = new WrappedVaultKey(
                ciphertext: $entrada['recovery_wrapped_key'],
                iv: $entrada['recovery_wrapped_key_iv'],
            );
        }

        $setRecoveryKey->handle(
            userId: $user->id,
            recoveryAuthHash: $request->string('recovery_auth_hash')->toString(),
            wrappedKeys: $wrappedKeys,
        );

        return response()->noContent();
    }

    /**
     * Entrega los envoltorios de recuperación a quien demuestra tener la clave.
     *
     * Público y limitado. Lo que devuelve no abre nada por sí solo: son blobs que
     * solo la clave de recuperación puede descifrar, y el servidor tampoco puede.
     */
    public function recover(RecoverRequest $request, RecoverAccess $recoverAccess): JsonResponse
    {
        $result = $recoverAccess->handle(
            email: $request->string('email')->toString(),
            recoveryAuthHash: $request->string('recovery_auth_hash')->toString(),
        );

        return response()->json([
            'data' => [
                'user' => UserResource::make($result->user),
                'wrapped_keys' => $result->wrappedKeys,
                'token' => $result->token,
            ],
        ]);
    }
}
