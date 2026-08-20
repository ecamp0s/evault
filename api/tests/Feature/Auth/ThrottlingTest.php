<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Cache;

/*
 * The attempt counter lives in the cache, and RefreshDatabase does not touch it.
 * Without clearing it, the first test that exhausts the limit leaves the following ones
 * blocked and the result depends on the order of execution.
 */
beforeEach(function (): void {
    Cache::flush();

    $this->user = User::factory()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
});

/** Tries to sign in with the wrong password. */
function failedAttempt(string $email = 'ada@evault.test'): \Illuminate\Testing\TestResponse
{
    return test()->postJson('/api/auth/login', [
        'email' => $email,
        'password' => 'no-es-la-suya',
    ]);
}

it('blocks the login once the number of attempts is exceeded', function (): void {
    $limit = (int) config('throttling.login.attempts');

    for ($i = 0; $i < $limit; $i++) {
        failedAttempt()->assertUnauthorized();
    }

    failedAttempt()->assertStatus(429);
});

it('returns Retry-After on the 429', function (): void {
    $limit = (int) config('throttling.login.attempts');

    for ($i = 0; $i < $limit; $i++) {
        failedAttempt();
    }

    $response = failedAttempt();

    $response->assertStatus(429)->assertHeader('Retry-After');
    expect((int) $response->headers->get('Retry-After'))->toBeGreaterThan(0);
});

/*
 * The important thing about the block: it does not lift on getting the password right.
 * If the attacker could unblock themselves by hitting on it, the limit would be of no
 * use at all.
 */
it('keeps blocking even when the password is got right afterwards', function (): void {
    $limit = (int) config('throttling.login.attempts');

    for ($i = 0; $i < $limit; $i++) {
        failedAttempt();
    }

    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->assertStatus(429);
});

it('lets people in normally within the threshold', function (): void {
    failedAttempt()->assertUnauthorized();

    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->assertOk();
});

/*
 * The limit counts requests to the endpoint and not failures alone, and this test
 * writes that down so it is not discovered by surprise.
 *
 * Clearing the counter after a successful login was considered, which is what counting
 * failures alone would take. It was discarded: the middleware stores the counter under
 * md5(limiterName . key), and that transformation is an internal detail of Laravel that
 * is no part of its public API. Reproducing it would have coupled the project to
 * something that can change in any minor version, and the failure mode would be silent:
 * users blocked more than they should be with nothing warning.
 *
 * What is lost is a rare case: somebody who fails four times, gets it right on the
 * fifth and tries to sign in again within the same minute. What is gained is not
 * depending on an undocumented detail. The price of that case is waiting a minute.
 */
it('counts the successful attempts too', function (): void {
    $limit = (int) config('throttling.login.attempts');
    $credentials = ['email' => 'ada@evault.test', 'password' => 'contraseña-larga'];

    for ($i = 0; $i < $limit; $i++) {
        $this->postJson('/api/auth/login', $credentials)->assertOk();
    }

    $this->postJson('/api/auth/login', $credentials)->assertStatus(429);
});

/*
 * The key includes the email, so attacking one account cannot lock another out from
 * the same IP. Without this, in an office behind NAT attacking one colleague would be
 * enough to block everybody.
 */
it('does not share a counter between different emails from the same IP', function (): void {
    $limit = (int) config('throttling.login.attempts');
    User::factory()->create(['email' => 'otro@evault.test', 'password' => 'contraseña-larga']);

    for ($i = 0; $i < $limit; $i++) {
        failedAttempt('ada@evault.test');
    }

    failedAttempt('ada@evault.test')->assertStatus(429);

    $this->postJson('/api/auth/login', [
        'email' => 'otro@evault.test',
        'password' => 'contraseña-larga',
    ])->assertOk();
});

it('limits the registration too', function (): void {
    $limit = (int) config('throttling.register.attempts');

    for ($i = 0; $i < $limit; $i++) {
        $this->postJson('/api/auth/register', registrationData([
            'name' => 'Nueva',
            'email' => "nueva{$i}@evault.test",
        ]))->assertCreated();
    }

    $this->postJson('/api/auth/register', registrationData([
        'name' => 'Una más',
        'email' => 'unamas@evault.test',
    ]))->assertStatus(429);
});

/*
 * The registration limit runs by IP alone on purpose: were the email included,
 * changing it on every request would dodge it, which is exactly what whoever creates
 * accounts in bulk does. This test pins that decision.
 */
it('counts registration by IP and not by email', function (): void {
    $limit = (int) config('throttling.register.attempts');

    for ($i = 0; $i < $limit; $i++) {
        $this->postJson('/api/auth/register', registrationData([
            'name' => 'Nueva',
            'email' => "distinta{$i}@evault.test",
        ]))->assertCreated();
    }

    $this->postJson('/api/auth/register', registrationData([
        'name' => 'Otro correo cualquiera',
        'email' => 'jamas-usado@evault.test',
    ]))->assertStatus(429);
});

it('does not limit the routes that already demand a token', function (): void {
    $token = $this->user->createToken('api')->plainTextToken;

    // Well past the login threshold, to make clear that it does not apply.
    for ($i = 0; $i < 20; $i++) {
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertOk();
    }
});
