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

it('devuelve usuario y token con credenciales correctas', function (): void {
    $result = (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'contraseña-larga');

    expect($result->user->id)->toBe($this->user->id)
        ->and($result->token)->not->toBeEmpty();
});

it('acepta el email con otra caja y con espacios', function (): void {
    $result = (new LoginUser(new IssueSessionToken))->handle('  ADA@Evault.Test  ', 'contraseña-larga');

    expect($result->user->id)->toBe($this->user->id);
});

it('rechaza una contraseña incorrecta', function (): void {
    expect(fn () => (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'no-es-la-suya'))
        ->toThrow(InvalidCredentials::class);
});

it('rechaza un email que no existe', function (): void {
    expect(fn () => (new LoginUser(new IssueSessionToken))->handle('nadie@evault.test', 'contraseña-larga'))
        ->toThrow(InvalidCredentials::class);
});

it('no emite ningún token cuando las credenciales fallan', function (): void {
    try {
        (new LoginUser(new IssueSessionToken))->handle('ada@evault.test', 'no-es-la-suya');
    } catch (InvalidCredentials) {
        // esperado
    }

    $this->assertDatabaseCount('personal_access_tokens', 0);
});

it('usa el mismo mensaje para email inexistente y contraseña incorrecta', function (): void {
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
