<?php

declare(strict_types=1);

use App\Application\Auth\ListSessions;
use App\Application\Auth\RevokeOtherSessions;
use App\Application\Auth\RevokeSession;
use App\Application\Auth\SessionNotFound;
use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/*
 * Second barrier of the double guard: the session services called directly, with no
 * middleware and no controller that only ever passes the caller's own identifiers.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->create();
    $this->grace = User::factory()->create();
    $this->adas = $this->ada->createToken('web', ['*'], now()->addHours(12))->accessToken;
    $this->graces = $this->grace->createToken('web', ['*'], now()->addHours(12))->accessToken;
});

it('revoking another account\'s session throws and closes nothing', function (): void {
    expect(fn () => app(RevokeSession::class)->handle($this->ada->id, $this->graces->id))
        ->toThrow(SessionNotFound::class)
        ->and(PersonalAccessToken::query()->whereKey($this->graces->id)->exists())->toBeTrue();
});

it('closing the others keeps the one given, and only within the account', function (): void {
    $alsoAdas = $this->ada->createToken('extension', ['*'], now()->addHours(12))->accessToken;

    $closed = app(RevokeOtherSessions::class)->handle($this->ada->id, $this->adas->id);

    expect($closed)->toBe(1)
        ->and(PersonalAccessToken::query()->whereKey($alsoAdas->id)->exists())->toBeFalse()
        ->and(PersonalAccessToken::query()->whereKey($this->adas->id)->exists())->toBeTrue()
        ->and(PersonalAccessToken::query()->whereKey($this->graces->id)->exists())->toBeTrue();
});

it('listing shows only the account\'s own sessions', function (): void {
    $sessions = app(ListSessions::class)->handle($this->ada->id, $this->adas->id);

    expect(array_map(fn ($session) => $session->id, $sessions))->toBe([$this->adas->id]);
});
