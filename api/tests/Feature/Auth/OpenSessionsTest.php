<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\PersonalAccessToken;

/*
 * The account's open sessions, and closing them without rotating the master password
 * (ADR-018 §2.5, #711).
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
    $this->current = $this->ada->createToken('web', ['*'], now()->addHours(12));
    $this->asAda = fn () => $this->withHeader('Authorization', "Bearer {$this->current->plainTextToken}");
    RateLimiter::clear('auth.passkey|127.0.0.1|ada@evault.test');
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/** The client each token of Ada's was issued to, by what the API says. */
function listedClients(Closure $as): array
{
    return array_column($as()->getJson('/api/auth/sessions')->assertOk()->json('data'), 'client');
}

it('lists the open sessions and marks the one asking', function (): void {
    $other = $this->ada->createToken('extension', ['*'], now()->addHours(12))->accessToken;

    $sessions = ($this->asAda)()->getJson('/api/auth/sessions')->assertOk()->json('data');

    expect(collect($sessions)->pluck('current', 'id')->all())->toBe([
        $this->current->accessToken->id => true,
        $other->id => false,
    ]);
});

it('exposes only the fields of the contract, and never the token', function (): void {
    $session = ($this->asAda)()->getJson('/api/auth/sessions')->json('data.0');

    expect(array_keys($session))
        ->toBe(['id', 'client', 'created_at', 'last_used_at', 'expires_at', 'current']);
});

it('tells the web from the extension, a recovery, and an old token that did not say', function (): void {
    $this->ada->createToken('extension', ['*'], now()->addHours(12));
    $this->ada->createToken(AccessTokens::RECOVERY_NAME, [AccessTokens::RECOVERY_ABILITY], now()->addMinutes(15));
    $this->ada->createToken(AccessTokens::NAME, ['*'], now()->addHours(12));

    expect(listedClients($this->asAda))->toEqualCanonicalizing(['web', 'extension', 'recovery', null]);
});

it('leaves expired tokens out, because they no longer open anything', function (): void {
    $this->ada->createToken('web', ['*'], now()->subMinute());

    expect(listedClients($this->asAda))->toBe(['web']);
});

it('says when each session was last used', function (): void {
    Carbon::setTestNow('2026-09-28 10:00:00');
    ($this->asAda)()->getJson('/api/auth/me')->assertOk();

    $session = ($this->asAda)()->getJson('/api/auth/sessions')->json('data.0');

    expect(Carbon::parse($session['last_used_at'])->toDateTimeString())->toBe('2026-09-28 10:00:00');
});

it('closing the others leaves the one asking alive and says how many it closed', function (): void {
    $web = $this->ada->createToken('web', ['*'], now()->addHours(12))->plainTextToken;
    $extension = $this->ada->createToken('extension', ['*'], now()->addHours(12))->plainTextToken;

    ($this->asAda)()->deleteJson('/api/auth/sessions')->assertOk()->assertJsonPath('data.closed', 2);

    ($this->asAda)()->getJson('/api/auth/me')->assertOk();
    // The next request of the extension fails: that 401 is what sends its popup back to
    // the passkey (ADR-023). The guard is reset because it caches the user it resolved.
    foreach ([$web, $extension] as $closed) {
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$closed}")->getJson('/api/auth/me')->assertUnauthorized();
    }
});

it('closing the others touches no other account', function (): void {
    $grace = User::factory()->create();
    $graces = $grace->createToken('web', ['*'], now()->addHours(12))->accessToken;

    ($this->asAda)()->deleteJson('/api/auth/sessions')->assertOk()->assertJsonPath('data.closed', 0);

    expect(PersonalAccessToken::query()->whereKey($graces->id)->exists())->toBeTrue();
});

it('closes one session by its identifier', function (): void {
    $other = $this->ada->createToken('extension', ['*'], now()->addHours(12))->accessToken;

    ($this->asAda)()->deleteJson("/api/auth/sessions/{$other->id}")->assertNoContent();

    expect(PersonalAccessToken::query()->whereKey($other->id)->exists())->toBeFalse()
        ->and(PersonalAccessToken::query()->whereKey($this->current->accessToken->id)->exists())->toBeTrue();
});

it('somebody else\'s session and one that does not exist answer alike, and nothing is closed', function (): void {
    $graces = User::factory()->create()->createToken('web', ['*'], now()->addHours(12))->accessToken;

    $fromForeign = ($this->asAda)()->deleteJson("/api/auth/sessions/{$graces->id}");
    $fromMissing = ($this->asAda)()->deleteJson('/api/auth/sessions/999999');

    expect($fromForeign->status())->toBe(404)
        ->and($fromForeign->json())->toBe($fromMissing->json())
        ->and(PersonalAccessToken::query()->whereKey($graces->id)->exists())->toBeTrue();
});

it('the list never shows another account\'s sessions', function (): void {
    User::factory()->create()->createToken('extension', ['*'], now()->addHours(12));

    expect(listedClients($this->asAda))->toBe(['web']);
});

it('the three endpoints demand authentication, and a recovery token is not enough', function (): void {
    $recovery = $this->ada->createToken(
        AccessTokens::RECOVERY_NAME, [AccessTokens::RECOVERY_ABILITY], now()->addMinutes(15),
    )->plainTextToken;

    $this->getJson('/api/auth/sessions')->assertUnauthorized();
    $this->deleteJson('/api/auth/sessions')->assertUnauthorized();
    $this->deleteJson("/api/auth/sessions/{$this->current->accessToken->id}")->assertUnauthorized();

    $this->withHeader('Authorization', "Bearer {$recovery}")->deleteJson('/api/auth/sessions')->assertForbidden();
    expect(PersonalAccessToken::query()->where('tokenable_id', $this->ada->id)->count())->toBe(2);
});

/*
 * How the name gets there: each door takes the client from the request, and one that
 * does not say keeps the old name, which the list shows as unidentified.
 */
it('names the token after the client that logs in, and keeps the old name when it does not say', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test', 'password' => 'contraseña-larga', 'client' => 'web',
    ])->assertOk();
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test', 'password' => 'contraseña-larga',
    ])->assertOk();

    expect(PersonalAccessToken::query()->latest('id')->limit(2)->pluck('name')->all())
        ->toBe([AccessTokens::NAME, 'web']);
});

it('names the token of a passkey unlock after the client, which is how the extension is told apart', function (): void {
    Passkey::factory()->create([
        'user_id' => $this->ada->id,
        'vault_id' => $this->ada->personalVault->id,
        'auth_hash' => 'el-hash-del-prf',
    ]);

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf', 'client' => 'extension',
    ])->assertOk();

    expect(PersonalAccessToken::query()->latest('id')->value('name'))->toBe('extension');
});

it('tells the Firefox extension from the Chrome one, and leaves the existing tokens as they were (#753)', function (): void {
    Passkey::factory()->create([
        'user_id' => $this->ada->id,
        'vault_id' => $this->ada->personalVault->id,
        'auth_hash' => 'el-hash-del-prf',
    ]);
    // Issued before Firefox existed, by a Chrome build nobody rebuilt.
    $this->ada->createToken('extension', ['*'], now()->addHours(12));

    $this->postJson('/api/auth/passkey', [
        'email' => 'ada@evault.test', 'auth_hash' => 'el-hash-del-prf', 'client' => 'extension-firefox',
    ])->assertOk();

    expect(PersonalAccessToken::query()->latest('id')->value('name'))->toBe('extension-firefox')
        ->and(listedClients($this->asAda))->toContain('extension-firefox', 'extension');
});

it('names the token of a sign-up after the client', function (): void {
    $this->postJson('/api/auth/register', [
        'name' => 'Grace', 'email' => 'grace@evault.test', 'password' => 'contraseña-larga',
        'wrapped_key' => 'k', 'wrapped_key_iv' => 'iv', 'client' => 'web',
    ])->assertCreated();

    expect(PersonalAccessToken::query()->latest('id')->value('name'))->toBe('web');
});

it('refuses a client outside the closed list, so no free text reaches the table', function (): void {
    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test', 'password' => 'contraseña-larga', 'client' => 'Mozilla/5.0 (X11; Linux)',
    ])->assertStatus(422)->assertJsonValidationErrors(['client']);
});
