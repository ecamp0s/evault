<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\MasterPasswordController;
use App\Http\Controllers\Auth\RecoveryController;
use App\Http\Controllers\Vaults\VaultController;
use App\Http\Controllers\Vaults\VaultItemController;
use App\Http\Middleware\EnsureVaultMembership;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

/*
 * Sonda pública bajo el prefijo /api. A diferencia de /up, que Laravel sirve
 * fuera de este grupo, esta sí lleva cabeceras CORS, así que la SPA puede
 * comprobar desde el navegador que alcanza la API y que el origen está bien
 * configurado. También sirve de healthcheck a un despliegue en contenedores.
 */
Route::get('/health', fn (): JsonResponse => response()->json(['status' => 'ok']));

Route::prefix('auth')->name('auth.')->group(function (): void {
    /*
     * Los dos endpoints públicos van limitados. Cada uno con su limitador porque
     * cuentan cosas distintas: el de login por IP y correo, el de registro solo
     * por IP. Ver config/throttling.php.
     *
     * logout y me no se limitan: exigen un token válido, así que quien puede
     * llamarlos ya está autenticado y no hay nada que adivinar por fuerza bruta.
     */
    Route::post('/register', [AuthController::class, 'register'])
        ->middleware('throttle:auth.register')
        ->name('register');

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:auth.login')
        ->name('login');

    /*
     * Recuperación de acceso con la clave de recuperación. Ver ADR-010.
     *
     * Es público porque quien lo llama no puede autenticarse: ha perdido la
     * contraseña maestra de la que se deriva el hash normal. Lleva su propio
     * limitador, más estricto que el de login, porque el perfil de uso es distinto:
     * nadie recupera su cuenta cinco veces al día.
     */
    Route::post('/recover', [RecoveryController::class, 'recover'])
        ->middleware('throttle:auth.recovery')
        ->name('recover');

    /*
     * abilities:* acompaña a auth:sanctum en TODAS las rutas autenticadas, y no es
     * decorativo: desde ADR-010 existe un segundo tipo de token.
     *
     * Los tokens de sesión normales se emiten con la capacidad `*`, así que pasan.
     * El de recuperación se emite solo con `recovery:complete`, así que no pasa por
     * ninguna de estas puertas: quien lo tiene ha demostrado poseer la clave de
     * recuperación, pero todavía no sabe ninguna contraseña maestra, y lo único que
     * puede hacer es terminar la operación fijando una nueva.
     *
     * Sin este middleware, ese token abriría la vault entera, que es exactamente lo
     * que ADR-010 dice que no debe poder hacer. Hay un test que lo comprueba.
     */
    Route::middleware(['auth:sanctum', 'abilities:*'])->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
        Route::get('/me', [AuthController::class, 'me'])->name('me');

        /*
         * Registrar o sustituir la clave de recuperación exige sesión normal, no el
         * token de recuperación: hace falta la clave de vault en memoria para poder
         * envolverla, y eso solo lo tiene quien acaba de desbloquear.
         */
        Route::post('/recovery-key', [RecoveryController::class, 'store'])->name('recovery-key');

        /*
         * Cambio de contraseña maestra. Ver ADR-008.
         *
         * Exige sesión normal Y el hash de autenticación actual: un token robado no
         * puede servir para dejar fuera al dueño. Lleva limitador propio porque
         * recibe ese hash, así que sin él sería un sitio donde probar contraseñas.
         */
        Route::put('/master-password', [MasterPasswordController::class, 'update'])
            ->middleware('throttle:auth.master-password')
            ->name('master-password');
    });
});

/*
 * Los vaults del usuario autenticado.
 *
 * Va fuera del grupo de abajo a propósito: no lleva vault en la URL porque es
 * justamente la ruta que sirve para averiguar cuáles hay. El aislamiento lo hace
 * el servicio, que solo devuelve los del usuario que se le pasa.
 */
Route::middleware(['auth:sanctum', 'abilities:*'])
    ->get('/vaults', [VaultController::class, 'index'])
    ->name('vaults.index');

/*
 * Items de una vault.
 *
 * El identificador del vault va en la ruta y no se infiere de nada: la API es
 * stateless y no tiene sesión donde guardar un contexto activo, así que cada
 * petición dice sobre qué vault opera. Ver ADR-004.
 *
 * EnsureVaultMembership es la primera barrera del double guard y cubre todo el
 * grupo, de modo que una ruta nueva queda protegida sin que nadie tenga que
 * acordarse. La segunda barrera vive dentro de cada servicio de aplicación.
 */
Route::middleware(['auth:sanctum', 'abilities:*', EnsureVaultMembership::class])
    ->prefix('vaults/{vault}')
    ->name('vaults.items.')
    ->group(function (): void {
        Route::get('/items', [VaultItemController::class, 'index'])->name('index');
        Route::post('/items', [VaultItemController::class, 'store'])->name('store');
        Route::get('/items/{item}', [VaultItemController::class, 'show'])->name('show');
        Route::patch('/items/{item}', [VaultItemController::class, 'update'])->name('update');
        Route::delete('/items/{item}', [VaultItemController::class, 'destroy'])->name('destroy');
    });
