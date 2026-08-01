<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Los tests de Feature se ejecutan sobre la TestCase de Laravel con la base
| de datos recreada en cada test. phpunit.xml fuerza SQLite in-memory, así
| que RefreshDatabase nunca toca el MySQL de desarrollo.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
 * Los servicios de aplicación persisten, así que sus tests necesitan la TestCase
 * de Laravel y base de datos aunque vivan en Unit. Se listan los subdirectorios de
 * uno en uno y no Unit entero a propósito: los tests que sí son unitarios puros,
 * como los de App\Support, deben seguir corriendo sin base de datos, porque si la
 * tuvieran disponible nada impediría que empezaran a depender de ella sin querer.
 */
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Unit/Auth', 'Unit/Vaults');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/**
 * Olvida el usuario que el guard ya resolvió.
 *
 * Hace falta porque todas las peticiones de un mismo test comparten una única
 * instancia de la aplicación, y el guard cachea el usuario la primera vez que lo
 * resuelve. Sin esto, una petición posterior a revocar un token seguiría viendo al
 * usuario en caché y devolvería 200 donde en producción devuelve 401, porque allí
 * cada petición arranca desde cero. Llamarlo entre peticiones reproduce ese
 * aislamiento; no compensa ningún defecto del código de aplicación.
 */
function olvidarSesionResuelta(): void
{
    Auth::forgetGuards();
}
