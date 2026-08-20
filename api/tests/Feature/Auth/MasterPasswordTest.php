<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

/*
 * Changing the master password. See ADR-008.
 *
 * What makes this operation cheap is that the vault key does not change: it is
 * re-wrapped with the new master key and the items are not touched. What is checked
 * here is that the server writes all of that or writes nothing.
 */

beforeEach(function (): void {
    Cache::flush();

    $this->user = User::factory()->withPersonalVault()->create([
        'email' => 'ada@evault.test',
        'password' => 'hash-actual',
    ]);
    $this->vault = $this->user->personalVault;
});

/**
 * The body of a valid change, with whatever one wants changed on top.
 *
 * What goes into the wrappers are not real keys: the server cannot tell them from any
 * literal, and that inability is what ADR-008 guarantees.
 *
 * @param  array<string, mixed>  $extra
 * @return array<string, mixed>
 */
function masterPasswordData(string $vaultId, array $extra = []): array
{
    return array_merge([
        'current_password' => 'hash-actual',
        'password' => 'hash-nuevo',
        'wrapped_keys' => [[
            'vault_id' => $vaultId,
            'wrapped_key' => 'envoltorio-nuevo',
            'wrapped_key_iv' => 'nonce-nuevo',
        ]],
    ], $extra);
}

it('demands authentication', function (): void {
    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id))
        ->assertUnauthorized();
});

it('changes the authentication hash and re-wraps the key', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id))
        ->assertNoContent();

    $stored = User::query()->findOrFail($this->user->id);

    expect(Hash::check('hash-nuevo', $stored->password))->toBeTrue()
        ->and(Hash::check('hash-actual', $stored->password))->toBeFalse();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id,
        'user_id' => $this->user->id,
        'wrapped_key' => 'envoltorio-nuevo',
        'wrapped_key_iv' => 'nonce-nuevo',
    ]);
});

/*
 * The items are not touched, which is the whole point of ADR-008. Were this operation
 * to start rewriting them, changing the password would stop being cheap and would
 * become able to corrupt the vault halfway.
 */
it('touches no item at all', function (): void {
    $item = $this->vault->items()->create([
        'ciphertext' => 'contenido-cifrado',
        'iv' => 'nonce-del-item',
        'version' => 2,
    ]);

    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id));

    expect($item->fresh()->ciphertext)->toBe('contenido-cifrado')
        ->and($item->fresh()->iv)->toBe('nonce-del-item');
});

/*
 * Having a session is not enough: the password in place has to be known. Without this,
 * a stolen token would be enough to lock the owner out of their own vault.
 */
it('refuses a wrong current authentication hash', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
        'current_password' => 'no-es-el-suyo',
    ]))->assertUnauthorized();

    expect(Hash::check('hash-actual', User::query()->findOrFail($this->user->id)->password))->toBeTrue();
});

it('demands all three fields of every wrapper', function (array $without): void {
    actAsSession($this->user);

    $entry = [
        'vault_id' => $this->vault->id,
        'wrapped_key' => 'envoltorio-nuevo',
        'wrapped_key_iv' => 'nonce-nuevo',
    ];

    unset($entry[$without[0]]);

    $this->putJson('/api/auth/master-password', [
        'current_password' => 'hash-actual',
        'password' => 'hash-nuevo',
        'wrapped_keys' => [$entry],
    ])->assertUnprocessable();
})->with([[['vault_id']], [['wrapped_key']], [['wrapped_key_iv']]]);

/*
 * Re-wrapping some vaults and not others would leave the missing ones shut under a
 * master key that no longer exists, and that is not discovered until somebody tries to
 * open them.
 */
it('demands re-wrapping every one of the user\'s vaults', function (): void {
    $second = Vault::query()->create(['name' => 'Compartida']);
    $second->members()->attach($this->user->id, membership());

    actAsSession($this->user);

    // It only sends the personal one, leaving the second out.
    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id))
        ->assertNotFound();

    expect(Hash::check('hash-actual', User::query()->findOrFail($this->user->id)->password))->toBeTrue();
});

it('re-wraps every vault when they are all sent', function (): void {
    $second = Vault::query()->create(['name' => 'Compartida']);
    $second->members()->attach($this->user->id, membership());

    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
        'wrapped_keys' => [
            ['vault_id' => $this->vault->id, 'wrapped_key' => 'personal-nuevo', 'wrapped_key_iv' => 'nonce-1'],
            ['vault_id' => $second->id, 'wrapped_key' => 'compartida-nuevo', 'wrapped_key_iv' => 'nonce-2'],
        ],
    ]))->assertNoContent();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $this->vault->id, 'wrapped_key' => 'personal-nuevo',
    ]);
    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $second->id, 'wrapped_key' => 'compartida-nuevo',
    ]);
});

/*
 * Cross-tenant isolation, mandatory under ADR-004.
 */
it('does not allow re-wrapping somebody else\'s key', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $this->putJson('/api/auth/master-password', masterPasswordData($other->personalVault->id))
        ->assertNotFound();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $other->personalVault->id,
        'user_id' => $other->id,
        'wrapped_key' => 'clave-envuelta-de-prueba',
    ]);
});

it('limits the attempts and answers 429', function (): void {
    actAsSession($this->user);

    $limit = (int) config('throttling.master_password.attempts');

    for ($i = 0; $i < $limit; $i++) {
        $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
            'current_password' => 'no-es-el-suyo',
        ]))->assertUnauthorized();
    }

    $this->putJson('/api/auth/master-password', masterPasswordData($this->vault->id, [
        'current_password' => 'no-es-el-suyo',
    ]))->assertStatus(429)->assertHeader('Retry-After');
});
