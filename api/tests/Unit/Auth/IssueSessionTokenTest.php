<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Application\Auth\IssueSessionToken;
use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

beforeEach(function (): void {
    $this->user = User::factory()->create();
    $this->issue = new IssueSessionToken;
});

it('issues a token that expires', function (): void {
    $this->issue->handle($this->user);

    $token = PersonalAccessToken::query()->firstOrFail();

    expect($token->expires_at)->not->toBeNull()
        ->and($token->expires_at->timestamp)
        ->toEqualWithDelta(now()->addHours(AccessTokens::SESSION_HOURS)->timestamp, 5);
});

/*
 * Registration and login have to issue indistinguishable tokens: were the name or the
 * abilities to differ, the token would reveal which way it was obtained. Hence both
 * going through this service.
 */
it('issues the token with the usual name and abilities', function (): void {
    $this->issue->handle($this->user);

    $token = PersonalAccessToken::query()->firstOrFail();

    expect($token->name)->toBe(AccessTokens::NAME)
        ->and($token->abilities)->toBe(['*']);
});

/*
 * The sweep is what keeps the table from growing without a ceiling. Every page reload
 * locks the vault and unlocking does a full login underneath, so without this one
 * token per reload piled up that nobody was going to use. See issue #149.
 */
it('sweeps the account\'s already expired tokens when issuing a new one', function (): void {
    $this->user->createToken(AccessTokens::NAME, ['*'], now()->subMinute());
    $this->user->createToken(AccessTokens::NAME, ['*'], now()->subDay());

    expect(PersonalAccessToken::query()->count())->toBe(2);

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->count())->toBe(1)
        ->and(PersonalAccessToken::query()->firstOrFail()->expires_at->isFuture())->toBeTrue();
});

/*
 * Sweeping the expired ones must not take down sessions still open on other devices.
 * It is the same guarantee LogoutUser defends by revoking only the request's token.
 */
it('does not touch the account\'s tokens that are still alive', function (): void {
    $alive = $this->user->createToken(AccessTokens::NAME, ['*'], now()->addHours(3))->accessToken;

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->whereKey($alive->id)->exists())->toBeTrue()
        ->and(PersonalAccessToken::query()->count())->toBe(2);
});

/*
 * Isolation between accounts, mandatory under ADR-004: the sweep is scoped to the user
 * authenticating and cannot reach another's tokens, not even the expired ones.
 */
it('does not delete another account\'s expired tokens', function (): void {
    $otherSession = User::factory()->create();
    $otherUsers = $otherSession->createToken(AccessTokens::NAME, ['*'], now()->subDay())->accessToken;

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->whereKey($otherUsers->id)->exists())->toBeTrue();
});

/*
 * The recovery token has an expiry of its own, far shorter, and must not be affected
 * while it is still alive: somebody halfway through a recovery cannot lose the token
 * they are going to finish it with.
 */
it('does not touch a recovery token that is still alive', function (): void {
    $recovery = $this->user->createToken(
        AccessTokens::RECOVERY_NAME,
        [AccessTokens::RECOVERY_ABILITY],
        now()->addMinutes(AccessTokens::RECOVERY_MINUTES),
    )->accessToken;

    $this->issue->handle($this->user);

    expect(PersonalAccessToken::query()->whereKey($recovery->id)->exists())->toBeTrue();
});
