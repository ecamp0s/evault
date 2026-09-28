<?php

declare(strict_types=1);

use App\Application\Auth\DeleteAccount;
use App\Application\Auth\InvalidCredentials;
use App\Models\User;

/*
 * Second barrier of the double guard (ADR-024 §4): the service called directly, with no
 * controller in front, still needs the account's own hash and email.
 */

beforeEach(function (): void {
    $this->ada = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test', 'password' => 'hash-de-ada']);
    $this->grace = User::factory()->withPersonalVault()->create(['email' => 'grace@evault.test', 'password' => 'hash-de-grace']);
});

it('refuses somebody else\'s password for this account', function (): void {
    expect(fn () => app(DeleteAccount::class)->handle($this->ada->id, 'hash-de-grace', 'ada@evault.test'))
        ->toThrow(InvalidCredentials::class);

    expect(User::query()->whereKey($this->ada->id)->exists())->toBeTrue();
});

it('refuses somebody else\'s full proof for this account', function (): void {
    expect(fn () => app(DeleteAccount::class)->handle($this->ada->id, 'hash-de-grace', 'grace@evault.test'))
        ->toThrow(InvalidCredentials::class);

    expect(User::query()->count())->toBe(2);
});

it('with the account\'s own proof, deletes that account and only that one', function (): void {
    app(DeleteAccount::class)->handle($this->ada->id, 'hash-de-ada', 'ada@evault.test');

    expect(User::query()->pluck('email')->all())->toBe(['grace@evault.test']);
});
