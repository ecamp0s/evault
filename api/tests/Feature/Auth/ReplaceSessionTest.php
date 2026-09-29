<?php

declare(strict_types=1);

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;

/*
 * Signing in again from a tab that already had a session replaces it (#725): reloading
 * the web locks the vault and unlocking signs in, so without this every reload left the
 * previous token alive for twelve hours, and the list of open sessions filled up with
 * the owner's own reloads.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
    RateLimiter::clear('auth.login|127.0.0.1|ada@evault.test');
    RateLimiter::clear('auth.passkey|127.0.0.1|ada@evault.test');
});

/** Ids of the account's tokens, in order. */
function tokenIdsOf(User $user): array
{
    return PersonalAccessToken::query()->where('tokenable_id', $user->id)->orderBy('id')->pluck('id')->all();
}

it('signing in with the id of the previous token revokes it, and leaves one session', function (): void {
    $previous = $this->ada->createToken('web', ['*'], now()->addHours(12))->accessToken;

    $token = $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test', 'password' => 'contraseña-larga', 'client' => 'web', 'replaces' => $previous->id,
    ])->assertOk()->json('data.token');

    expect(tokenIdsOf($this->ada))->toBe([(int) explode('|', $token)[0]]);
});

it('unlocking with a passkey replaces it the same way', function (): void {
    Passkey::factory()->create([
        'user_id' => $this->ada->id,
        'vault_id' => $this->ada->personalVault->id,
        'auth_hash' => 'el-hash-del-prf',
    ]);
    $previous = $this->ada->createToken('web', ['*'], now()->addHours(12))->accessToken;

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf', 'replaces' => $previous->id,
    ])->assertOk();

    expect(PersonalAccessToken::query()->whereKey($previous->id)->exists())->toBeFalse()
        ->and(tokenIdsOf($this->ada))->toHaveCount(1);
});

it('without it, signing in leaves the other sessions alone, as before', function (): void {
    $other = $this->ada->createToken('web', ['*'], now()->addHours(12))->accessToken;

    $this->postJson('/api/auth/login', ['email' => 'ada@evault.test', 'password' => 'contraseña-larga'])->assertOk();

    expect(PersonalAccessToken::query()->whereKey($other->id)->exists())->toBeTrue();
});

/*
 * Only the account's own. Another account's id changes nothing, and the answer is the
 * same as for an id that does not exist: this must not become a way to learn which ids
 * are there, nor to close somebody else's session.
 */
it('another account\'s id revokes nothing, and answers exactly like one that does not exist', function (): void {
    $grace = User::factory()->create();
    $graces = $grace->createToken('web', ['*'], now()->addHours(12))->accessToken;
    $body = fn (int $id) => ['email' => 'ada@evault.test', 'password' => 'contraseña-larga', 'replaces' => $id];

    $withForeign = $this->postJson('/api/auth/login', $body($graces->id));
    $withMissing = $this->postJson('/api/auth/login', $body(999_999));

    expect($withForeign->status())->toBe(200)
        ->and($withMissing->status())->toBe(200)
        ->and(array_keys($withForeign->json('data')))->toBe(array_keys($withMissing->json('data')))
        ->and(PersonalAccessToken::query()->whereKey($graces->id)->exists())->toBeTrue();
});

it('a wrong password revokes nothing, even naming the account\'s own token', function (): void {
    $previous = $this->ada->createToken('web', ['*'], now()->addHours(12))->accessToken;

    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test', 'password' => 'no-es-la-suya', 'replaces' => $previous->id,
    ])->assertUnauthorized();

    expect(PersonalAccessToken::query()->whereKey($previous->id)->exists())->toBeTrue();
});

it('refuses anything that is not a positive integer', function (string|int $value): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test', 'password' => 'contraseña-larga', 'replaces' => $value,
    ])->assertStatus(422)->assertJsonValidationErrors(['replaces']);
})->with(['abc', 0, -3]);
