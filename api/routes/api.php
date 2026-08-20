<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\EmailController;
use App\Http\Controllers\Auth\MasterPasswordController;
use App\Http\Controllers\Auth\RecoveryController;
use App\Http\Controllers\Vaults\VaultController;
use App\Http\Controllers\Vaults\VaultItemController;
use App\Http\Middleware\EnsureRecoveryToken;
use App\Http\Middleware\EnsureVaultMembership;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Route;

/*
 * Public probe under the /api prefix, unlike /up, which Laravel serves outside this
 * group. It lets the SPA check from the browser that it reaches the API, and it serves
 * as a healthcheck for a container deployment.
 *
 * It used to say this one carried CORS headers and /up did not. That stopped being
 * true in #296: since ADR-016 the SPA and the API share an origin, so there is no
 * cross-origin request to allow and CORS was removed from the project.
 */
Route::get('/health', fn (): JsonResponse => response()->json(['status' => 'ok']));

Route::prefix('auth')->name('auth.')->group(function (): void {
    /*
     * The two public endpoints are rate limited. Each with its own limiter because
     * they count different things: the login's by IP and email, the registration's by
     * IP only. See config/throttling.php.
     *
     * logout and me are not limited: they demand a valid token, so whoever can call
     * them is already authenticated and there is nothing to guess by brute force.
     */
    Route::post('/register', [AuthController::class, 'register'])
        ->middleware('throttle:auth.register')
        ->name('register');

    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:auth.login')
        ->name('login');

    /*
     * Recovering access with the recovery key. See ADR-010.
     *
     * Public because whoever calls it cannot authenticate: they have lost the master
     * password the ordinary hash is derived from. It carries its own limiter, stricter
     * than the login's, because the usage profile is different: nobody recovers their
     * account five times a day.
     */
    Route::post('/recover', [RecoveryController::class, 'recover'])
        ->middleware('throttle:auth.recovery')
        ->name('recover');

    /*
     * The final step of the recovery. See ADR-010.
     *
     * Outside the group below on purpose: it is reached by the single-use token, which
     * does NOT carry `*` and so would not get through `abilities:*`.
     *
     * And it does NOT use Sanctum's `ability` middleware, though that would look like
     * the obvious choice: an ordinary session token carries `*`, which satisfies any
     * ability check, so `ability:recovery:complete` would have let every session in
     * too. With that, a stolen token could have set a new master password without
     * knowing the current one. EnsureRecoveryToken compares the exact list.
     */
    Route::post('/recover/complete', [RecoveryController::class, 'complete'])
        ->middleware(['auth:sanctum', EnsureRecoveryToken::class])
        ->name('recover.complete');

    /*
     * abilities:* goes with auth:sanctum on EVERY authenticated route, and it is not
     * decorative: since ADR-010 there is a second kind of token.
     *
     * Ordinary session tokens are issued with the `*` ability, so they get through.
     * The recovery one is issued with `recovery:complete` only, so it gets through
     * none of these doors: whoever holds it has proven they possess the recovery key,
     * but does not yet know any master password, and the only thing they can do is
     * finish the operation by setting a new one.
     *
     * Without this middleware, that token would open the whole vault, which is exactly
     * what ADR-010 says it must not be able to do. There is a test that checks it.
     *
     * This block used to sit above the route before it, orphaned from the group it
     * describes.
     */
    Route::middleware(['auth:sanctum', 'abilities:*'])->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
        Route::get('/me', [AuthController::class, 'me'])->name('me');

        /*
         * Registering or replacing the recovery key demands an ordinary session, not
         * the recovery token: it takes the vault key in memory to wrap it, and only
         * whoever has just unlocked has that.
         */
        Route::post('/recovery-key', [RecoveryController::class, 'store'])->name('recovery-key');

        /*
         * Changing the master password. See ADR-008.
         *
         * It demands an ordinary session AND the current authentication hash: a stolen
         * token cannot be used to lock the owner out. It carries its own limiter
         * because it receives that hash, so without one it would be a place to try
         * passwords.
         */
        Route::put('/master-password', [MasterPasswordController::class, 'update'])
            ->middleware('throttle:auth.master-password')
            ->name('master-password');

        /*
         * Changing the email address. See ADR-014.
         *
         * The same doors as the one above, and not out of symmetry: the email is the
         * salt of the derivation (ADR-008), so changing it re-derives the master key
         * and forces a re-wrap just like a rotation. It demands the current hash for
         * the same reason, and carries its own limiter because it receives it.
         */
        Route::put('/email', [EmailController::class, 'update'])
            ->middleware('throttle:auth.email')
            ->name('email');
    });
});

/*
 * The authenticated user's vaults.
 *
 * Outside the group below on purpose: it carries no vault in the URL because it is
 * precisely the route that tells you which ones there are. The isolation is done by
 * the service, which only returns those of the user it is handed.
 */
Route::middleware(['auth:sanctum', 'abilities:*'])
    ->get('/vaults', [VaultController::class, 'index'])
    ->name('vaults.index');

/*
 * A vault's items.
 *
 * The vault identifier goes in the route and is inferred from nothing: the API is
 * stateless and has no session to keep an active context in, so every request says
 * which vault it operates on. See ADR-004.
 *
 * EnsureVaultMembership is the first barrier of the double guard and covers the whole
 * group, so a new route is protected without anybody having to remember. The second
 * barrier lives inside each application service.
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
