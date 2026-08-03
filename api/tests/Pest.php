<?php

use App\Application\Vaults\WrappedVaultKey;
use App\Models\User;
use App\Models\VaultRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
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
 * Una clave de vault envuelta, para los tests.
 *
 * No es una clave de verdad y no hace falta que lo sea: el servidor no puede
 * distinguirla de un literal cualquiera, y esa incapacidad es precisamente lo que
 * ADR-008 garantiza. Un valor legible se lee mejor en un fallo que 44 caracteres de
 * base64 que no dicen nada.
 */
function claveEnvuelta(
    string $ciphertext = 'clave-envuelta-de-prueba',
    string $iv = 'nonce-de-prueba',
): WrappedVaultKey {
    return new WrappedVaultKey($ciphertext, $iv);
}

/**
 * Los atributos del pivot al añadir a alguien a un vault con attach().
 *
 * Están juntos porque van juntos: una pertenencia sin clave envuelta es un miembro
 * que no puede abrir la vault, y la base de datos ya no lo admite.
 *
 * @return array<string, string>
 */
function pertenencia(VaultRole $role = VaultRole::Owner): array
{
    return [
        'role' => $role->value,
        'wrapped_key' => 'clave-envuelta-de-prueba',
        'wrapped_key_iv' => 'nonce-de-prueba',
    ];
}

/**
 * El cuerpo de un registro válido, con lo que se quiera cambiar encima.
 *
 * Existe porque el alta lleva cinco campos y dos de ellos son criptográficos, así
 * que repetirlos en cada test invita a copiarlos mal y obliga a tocar veinte sitios
 * cuando el contrato crece. Un test que quiera comprobar qué pasa sin uno de ellos
 * lo quita explícitamente, y eso se lee mejor que la ausencia en una lista larga.
 *
 * Lo que va en wrapped_key no es una clave de verdad: el servidor no puede
 * distinguirla de un literal cualquiera, que es justo lo que garantiza ADR-008.
 *
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function datosDeRegistro(array $extra = []): array
{
    return [
        'name' => 'Ada Lovelace',
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
        'wrapped_key' => 'clave-envuelta-de-prueba',
        'wrapped_key_iv' => 'nonce-de-prueba',
        ...$extra,
    ];
}

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

/**
 * Autentica como una sesión normal, con todas las capacidades.
 *
 * El `['*']` explícito NO es adorno y omitirlo sale caro: `Sanctum::actingAs($user)`
 * por defecto no da ninguna capacidad, y desde ADR-010 todas las rutas autenticadas
 * llevan `abilities:*`. Sin él, cualquier test contra una ruta protegida responde
 * 403 sin decir por qué, que se parece mucho a un fallo de permisos del código en
 * vez de a lo que es: un token de prueba mal construido.
 *
 * Existe ese middleware porque hay dos tipos de token desde la Iteración 4. El de
 * recuperación solo tiene `recovery:complete` y no debe abrir la vault.
 */
function actuarComoSesion(User $user): void
{
    Sanctum::actingAs($user, ['*']);
}
