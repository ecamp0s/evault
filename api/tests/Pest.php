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
| Feature tests run against Laravel's TestCase with the database recreated
| for each one. phpunit.xml forces SQLite in-memory, so RefreshDatabase
| never touches the MySQL used for development.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
 * The application services persist, so their tests need Laravel's TestCase and a
 * database even though they live under Unit. The subdirectories are listed one by one
 * and not Unit as a whole on purpose: the tests that really are pure unit tests, like
 * those of App\Support, have to keep running without a database, because if one were
 * available nothing would stop them from starting to depend on it by accident.
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
 * A wrapped vault key, for the tests.
 *
 * It is not a real key and does not need to be: the server cannot tell it from any
 * literal, and that inability is precisely what ADR-008 guarantees. A readable value
 * reads better in a failure than 44 characters of base64 that say nothing.
 */
function wrappedKey(
    string $ciphertext = 'clave-envuelta-de-prueba',
    string $iv = 'nonce-de-prueba',
): WrappedVaultKey {
    return new WrappedVaultKey($ciphertext, $iv);
}

/**
 * The pivot attributes when adding somebody to a vault with attach().
 *
 * They are together because they travel together: a membership with no wrapped key is
 * a member who cannot open the vault, and the database no longer admits it.
 *
 * @return array<string, string>
 */
function membership(VaultRole $role = VaultRole::Owner): array
{
    return [
        'role' => $role->value,
        'wrapped_key' => 'clave-envuelta-de-prueba',
        'wrapped_key_iv' => 'nonce-de-prueba',
    ];
}

/**
 * The body of a valid sign-up, with whatever one wants changed on top.
 *
 * It exists because the sign-up carries five fields and two of them are cryptographic,
 * so repeating them in every test invites copying them wrong and forces touching
 * twenty places when the contract grows. A test that wants to check what happens
 * without one of them removes it explicitly, and that reads better than an absence
 * from a long list.
 *
 * What goes into wrapped_key is not a real key: the server cannot tell it from any
 * literal, which is exactly what ADR-008 guarantees.
 *
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function registrationData(array $extra = []): array
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
 * Forgets the user the guard has already resolved.
 *
 * It is needed because every request in one test shares a single application instance,
 * and the guard caches the user the first time it resolves it. Without this, a request
 * made after revoking a token would still see the cached user and return 200 where
 * production returns 401, because there every request starts from scratch. Calling it
 * between requests reproduces that isolation; it compensates for no defect in the
 * application code.
 */
function forgetResolvedSession(): void
{
    Auth::forgetGuards();
}

/**
 * Authenticates as an ordinary session, with every ability.
 *
 * The explicit `['*']` is NOT decoration and leaving it out costs dearly:
 * `Sanctum::actingAs($user)` grants no ability by default, and since ADR-010 every
 * authenticated route carries `abilities:*`. Without it, any test against a protected
 * route answers 403 without saying why, which looks a lot like a permissions failure in
 * the code instead of what it is: a badly built test token.
 *
 * That middleware exists because there are two kinds of token since Iteration 4. The
 * recovery one carries only `recovery:complete` and must not open the vault.
 */
function actAsSession(User $user): void
{
    Sanctum::actingAs($user, ['*']);
}
