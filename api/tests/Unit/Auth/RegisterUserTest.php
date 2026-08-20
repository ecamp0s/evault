<?php

declare(strict_types=1);

use App\Application\Auth\EmailAlreadyRegistered;
use App\Application\Auth\RegisterUser;
use App\Models\User;
use App\Models\VaultRole;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;

it('creates the user and returns a token in the clear', function (): void {
    $result = app(RegisterUser::class)->handle('Ada Lovelace', 'ada@evault.test', 'contraseña-larga', wrappedKey());

    expect($result->user)->toBeInstanceOf(User::class)
        ->and($result->user->email)->toBe('ada@evault.test')
        ->and($result->user->name)->toBe('Ada Lovelace')
        ->and($result->token)->not->toBeEmpty();

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('personal_access_tokens', 1);
});

it('hashes the password', function (): void {
    $result = app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', wrappedKey());

    expect($result->user->password)->not->toBe('contraseña-larga')
        ->and(Hash::check('contraseña-larga', $result->user->password))->toBeTrue();
});

it('normalises the email and trims the name', function (): void {
    $result = app(RegisterUser::class)->handle('  Ada  ', '  ADA@Evault.Test  ', 'contraseña-larga', wrappedKey());

    expect($result->user->email)->toBe('ada@evault.test')
        ->and($result->user->name)->toBe('Ada');
});

/*
 * Second barrier of the double guard. The Form Request does not take part here, so this
 * test checks that the service defends itself on its own.
 */
it('refuses an already registered email even without going through the Form Request', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    expect(fn () => app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', wrappedKey()))
        ->toThrow(EmailAlreadyRegistered::class);

    $this->assertDatabaseCount('users', 1);
});

it('refuses a duplicate email differing only in case', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    expect(fn () => app(RegisterUser::class)->handle('Ada', 'ADA@EVAULT.TEST', 'contraseña-larga', wrappedKey()))
        ->toThrow(EmailAlreadyRegistered::class);
});

it('does not leave the user half created when the sign-up fails', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    try {
        app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', wrappedKey());
    } catch (EmailAlreadyRegistered) {
        // expected
    }

    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('personal_access_tokens', 0);
});

it('creates the user\'s personal vault inside the sign-up', function (): void {
    $result = app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', wrappedKey());

    $vault = $result->user->personalVault;

    expect($vault)->not->toBeNull()
        ->and($vault?->isPersonal())->toBeTrue();

    $this->assertDatabaseCount('vaults', 1);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $vault?->id,
        'user_id' => $result->user->id,
        'role' => VaultRole::Owner->value,
    ]);
});

/*
 * The issue's rollback criterion: if the vault cannot be created, no user must be left
 * without one, because the rest of the iteration takes for granted that there is always
 * one.
 *
 * The failure is provoked by removing the membership table instead of replacing the
 * service with a double. On purpose: CreatePersonalVault is final, and this way what
 * gets exercised is the real error path, with its real exception coming up through the
 * transaction, rather than a simulation that might not resemble it. It works because
 * SQLite admits DDL inside a transaction, and the tests always run on SQLite.
 */
it('leaves neither user nor token when creating the vault fails', function (): void {
    Schema::drop('vault_members');

    expect(fn () => app(RegisterUser::class)->handle('Ada', 'ada@evault.test', 'contraseña-larga', wrappedKey()))
        ->toThrow(QueryException::class);

    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('vaults', 0);
    $this->assertDatabaseCount('personal_access_tokens', 0);
});
