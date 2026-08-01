<?php

use App\Http\Controllers\Auth\AuthController;
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
        ->middleware('throttle:auth.registro')
        ->name('register');

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:auth.login')
        ->name('login');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
        Route::get('/me', [AuthController::class, 'me'])->name('me');
    });
});

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
Route::middleware(['auth:sanctum', EnsureVaultMembership::class])
    ->prefix('vaults/{vault}')
    ->name('vaults.items.')
    ->group(function (): void {
        Route::get('/items', [VaultItemController::class, 'index'])->name('index');
        Route::post('/items', [VaultItemController::class, 'store'])->name('store');
        Route::get('/items/{item}', [VaultItemController::class, 'show'])->name('show');
        Route::patch('/items/{item}', [VaultItemController::class, 'update'])->name('update');
        Route::delete('/items/{item}', [VaultItemController::class, 'destroy'])->name('destroy');
    });
