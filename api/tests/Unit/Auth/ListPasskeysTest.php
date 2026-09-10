<?php

declare(strict_types=1);

use App\Application\Auth\ListPasskeys;
use App\Models\Passkey;
use App\Models\User;

/*
 * The service that lists a user's passkeys. See ADR-021 and issue #559.
 *
 * WHY THIS EXISTS AS A TEST OF ITS OWN AND NOT ONLY THROUGH THE ENDPOINT. The promise
 * that a wrapper never leaves the server has two barriers: this service does not read
 * those columns, and PasskeyResource does not print them. Measured while writing #559,
 * only the second was watched — taking the column list off the query left every test
 * green, because the resource caught it further along.
 *
 * That is the shape of #574 again: a barrier asserted in a comment and protected by
 * nothing. Two barriers are worth having only if both are checked, otherwise the second
 * one is load-bearing and nobody knows it.
 */

it('does not even read the wrapper out of the database', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);

    $listed = app(ListPasskeys::class)->handle($user->id);

    expect($listed->first()?->getAttributes())
        ->not->toHaveKey('wrapped_key')
        ->not->toHaveKey('wrapped_key_iv')
        ->not->toHaveKey('auth_hash')
        ->and($listed->first()?->getAttributes())->toHaveKey('label');
});

it('returns only the passkeys of the user it is handed', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    Passkey::factory()->count(2)->create([
        'user_id' => $ada->id, 'vault_id' => $ada->personalVault->id,
    ]);
    Passkey::factory()->create([
        'user_id' => $grace->id, 'vault_id' => $grace->personalVault->id,
    ]);

    expect(app(ListPasskeys::class)->handle($ada->id))->toHaveCount(2);
});

/*
 * Ordered by creation so the list does not shuffle between loads. It matters more than
 * it sounds: this is the screen where somebody picks which passkey to revoke, and a
 * list that moves is a list where the wrong row gets clicked.
 */
it('keeps the order stable, oldest first', function (): void {
    $user = User::factory()->withPersonalVault()->create();

    $first = Passkey::factory()->create([
        'user_id' => $user->id,
        'vault_id' => $user->personalVault->id,
        'label' => 'el primero',
        'created_at' => now()->subDay(),
    ]);
    Passkey::factory()->create([
        'user_id' => $user->id,
        'vault_id' => $user->personalVault->id,
        'label' => 'el segundo',
        'created_at' => now(),
    ]);

    expect(app(ListPasskeys::class)->handle($user->id)->first()?->id)->toBe($first->id);
});
