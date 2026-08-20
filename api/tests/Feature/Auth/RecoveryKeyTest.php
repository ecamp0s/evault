<?php

declare(strict_types=1);

use App\Models\User;

/*
 * Registering and replacing the recovery key. See ADR-010.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create(['email' => 'ada@evault.test']);
    $this->vault = $this->user->personalVault;
});

/**
 * The body of a recovery-key registration, with whatever one wants changed.
 *
 * What goes into the wrappers are not real keys, as in the rest of the project's tests:
 * the server cannot tell them from any literal, and that inability is what ADR-010
 * guarantees.
 *
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function recoveryKeyData(string $vaultId, array $extra = []): array
{
    return array_merge([
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [[
            'vault_id' => $vaultId,
            'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
            'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
        ]],
    ], $extra);
}

it('demands authentication', function (): void {
    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id))
        ->assertUnauthorized();
});

it('registers the recovery key', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id))
        ->assertNoContent();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
        'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
    ]);
});

/*
 * The recovery hash is stored hashed, just like password. A server that stored the
 * value it received would hold in its database something to authenticate as the user
 * with. See ADR-010.
 */
it('never stores the recovery hash exactly as it arrives', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id));

    $stored = User::query()->findOrFail($this->user->id)->recovery_auth_hash;

    expect($stored)->not->toBeNull()
        ->and($stored)->not->toBe('hash-de-recuperacion')
        ->and(Hash::check('hash-de-recuperacion', (string) $stored))->toBeTrue();
});

it('replaces the previous key when regenerating it', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id));

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id, [
        'recovery_auth_hash' => 'hash-nuevo',
        'wrapped_keys' => [[
            'vault_id' => $this->vault->id,
            'recovery_wrapped_key' => 'envoltorio-nuevo',
            'recovery_wrapped_key_iv' => 'nonce-nuevo',
        ]],
    ]))->assertNoContent();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'recovery_wrapped_key' => 'envoltorio-nuevo',
    ]);

    // The previous one stops working at the moment of the replacement.
    $stored = (string) User::query()->findOrFail($this->user->id)->recovery_auth_hash;

    expect(Hash::check('hash-de-recuperacion', $stored))->toBeFalse()
        ->and(Hash::check('hash-nuevo', $stored))->toBeTrue();
});

it('demands all three fields of every wrapper', function (array $missingFields): void {
    actAsSession($this->user);

    $entry = [
        'vault_id' => $this->vault->id,
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
        'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
    ];

    unset($entry[$missingFields[0]]);

    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [$entry],
    ])->assertUnprocessable();
})->with([
    [['vault_id']],
    [['recovery_wrapped_key']],
    [['recovery_wrapped_key_iv']],
]);

it('demands the recovery hash', function (): void {
    actAsSession($this->user);

    $data = recoveryKeyData($this->vault->id);
    unset($data['recovery_auth_hash']);

    $this->postJson('/api/auth/recovery-key', $data)->assertUnprocessable();
});

/*
 * Cross-tenant isolation, mandatory under ADR-004.
 *
 * Writing into somebody else's row would be the gravest thing that could happen here:
 * it would leave the attacker with a second key to another person's vault, and the
 * owner none the wiser.
 */
it('does not allow registering a key over somebody else\'s vault', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($other->personalVault->id))
        ->assertNotFound();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $other->personalVault->id,
        'user_id' => $other->id,
        'recovery_wrapped_key' => null,
    ]);
});

/*
 * And it answers the same to a vault that does not exist, so as not to confirm which
 * ones do.
 */
it('answers the same to somebody else\'s vault as to one that does not exist', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $foreign = $this->postJson(
        '/api/auth/recovery-key',
        recoveryKeyData($other->personalVault->id)
    );

    $missing = $this->postJson(
        '/api/auth/recovery-key',
        recoveryKeyData('01952f3e-0000-7000-8000-000000000000')
    );

    expect($foreign->status())->toBe($missing->status())
        ->and($foreign->json('message'))->toBe($missing->json('message'));
});

/*
 * The recovery hash must appear in no response, just like password. It is in the
 * model's Hidden attribute, and this test fails if somebody takes it out of there.
 */
it('does not expose the recovery hash in the contract of /api/auth/me', function (): void {
    actAsSession($this->user);

    $this->postJson('/api/auth/recovery-key', recoveryKeyData($this->vault->id));

    $this->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonMissingPath('data.user.recovery_auth_hash')
        ->assertJsonPath('data.user', fn (array $user): bool => ! array_key_exists('recovery_auth_hash', $user));
});
