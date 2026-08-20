<?php

declare(strict_types=1);

use App\Application\Auth\InvalidCredentials;
use App\Application\Auth\IssueSessionToken;
use App\Application\Auth\LoginUser;
use App\Models\User;

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
