<?php

use App\Http\Controllers\Auth\AuthController;
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
    Route::post('/register', [AuthController::class, 'register'])->name('register');
    Route::post('/login', [AuthController::class, 'login'])->name('login');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
        Route::get('/me', [AuthController::class, 'me'])->name('me');
    });
});
