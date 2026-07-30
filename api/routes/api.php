<?php

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Sonda pública bajo el prefijo /api. A diferencia de /up, que Laravel sirve
 * fuera de este grupo, esta sí lleva cabeceras CORS, así que la SPA puede
 * comprobar desde el navegador que alcanza la API y que el origen está bien
 * configurado. También sirve de healthcheck a un despliegue en contenedores.
 */
Route::get('/health', fn (): JsonResponse => response()->json(['status' => 'ok']));

Route::get('/user', fn (Request $request) => $request->user())
    ->middleware('auth:sanctum');
