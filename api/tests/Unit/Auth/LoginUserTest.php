<?php

declare(strict_types=1);

use App\Application\Auth\InvalidCredentials;
use App\Application\Auth\IssueSessionToken;
use App\Application\Auth\LoginUser;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

beforeEach(function (): void {
    $this->user = User::factory()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
});

it('returns user and token with the right credentials', function (): void {
    $result = (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'contraseña-larga');

    expect($result->user->id)->toBe($this->user->id)
        ->and($result->token)->not->toBeEmpty();
});

it('accepts the email in a different case and with spaces', function (): void {
    $result = (new LoginUser(new IssueSessionToken))->handle('  ADA@Evault.Test  ', 'contraseña-larga');

    expect($result->user->id)->toBe($this->user->id);
});

it('refuses a wrong password', function (): void {
    expect(fn () => (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'no-es-la-suya'))
        ->toThrow(InvalidCredentials::class);
});

it('refuses an email that does not exist', function (): void {
    expect(fn () => (new LoginUser(new IssueSessionToken))->handle('nadie@evault.test', 'contraseña-larga'))
        ->toThrow(InvalidCredentials::class);
});

it('issues no token when the credentials fail', function (): void {
    try {
        (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'no-es-la-suya');
    } catch (InvalidCredentials) {
        // expected
    }

    $this->assertDatabaseCount('personal_access_tokens', 0);
});

it('uses the same message for a missing email and a wrong password', function (): void {
    $messages = [];

    foreach ([['nadie@evault.test', 'x'], ['ada@evault.test', 'no-es-la-suya']] as [$email, $password]) {
        try {
            (new LoginUser(new IssueSessionToken))->handle($email, $password);
        } catch (InvalidCredentials $e) {
            $messages[] = $e->getMessage();
        }
    }

    expect($messages)->toHaveCount(2)
        ->and($messages[0])->toBe($messages[1]);
});

/*
 * THE PROTECTION AGAINST THE TIMING CHANNEL, which had a comment promising it since
 * Iteration 1 and nothing behind it. See issue #587.
 *
 * `LoginUser` checks a hash even when the user does not exist, so an unregistered email
 * takes as long as a registered one with a wrong password. Taking that check away
 * changes no response — same message, same class, same everything — and left the whole
 * suite green when it was measured. What it changes is the time, and no assertion over
 * a message can see time.
 *
 * MEASURING DURATIONS WOULD BE THE WRONG FIX: a test comparing milliseconds is
 * intermittent on a loaded runner, and an intermittent check gets ignored wholesale —
 * the lesson of #62. What is deterministic is HOW MANY TIMES a hash is checked, which
 * is what the duration is made of.
 */
it('checks a hash even when the email is not registered', function (): void {
    Hash::shouldReceive('check')->once()->andReturn(false);

    expect(fn () => (new LoginUser(new IssueSessionToken))->handle('nadie@evault.test', 'x'))
        ->toThrow(InvalidCredentials::class);
});

/*
 * And the other side of it, so the pair says the whole thing: a registered email checks
 * a hash exactly once too. Without this, the test above passes over an implementation
 * that checks nothing at all for anybody.
 */
it('checks exactly one hash when the email is registered', function (): void {
    Hash::shouldReceive('check')->once()->andReturn(false);

    expect(fn () => (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'no-es'))
        ->toThrow(InvalidCredentials::class);
});
