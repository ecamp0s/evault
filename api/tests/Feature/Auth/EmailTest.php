<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Support\Facades\Hash;

/*
 * The email-change endpoint. See ADR-014.
 *
 * The email is not a profile field: by ADR-008 it is the salt the master key and the
 * recovery keys are derived from, so this does not update a field.
 */

beforeEach(function (): void {
    $this->user = User::factory()->withPersonalVault()->create([
        'email' => 'ada@evault.test',
        'password' => 'hash-actual',
    ]);
    $this->vault = $this->user->personalVault;
});

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function changeEmailPayload(string $vaultId, array $overrides = []): array
{
    return array_merge([
        'email' => 'ada.lovelace@evault.test',
        'current_password' => 'hash-actual',
        'password' => 'hash-nuevo',
        'wrapped_keys' => [[
            'vault_id' => $vaultId,
            'wrapped_key' => 'envoltorio-nuevo',
            'wrapped_key_iv' => 'nonce-nuevo',
        ]],
    ], $overrides);
}

it('changes the email and lets people in with the new one', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id))
        ->assertNoContent();

    $this->user->refresh();

    expect($this->user->email)->toBe('ada.lovelace@evault.test')
        ->and(Hash::check('hash-nuevo', $this->user->password))->toBeTrue();
});

it('normalises the email the same way the client does', function (): void {
    /*
     * Part of the cryptographic contract and not a courtesy: the email IS the salt, so
     * were the server to store it unnormalised, the client would derive with the
     * canonical form and the two keys would not match. The user would type their good
     * password and their vault would not open, WITH no error explaining it.
     *
     * The counterpart in the client is normalizeEmail() in lib/vault/crypto.ts.
     */
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => '  ADA.Lovelace@EVault.test  ',
    ]))
        ->assertNoContent();

    expect($this->user->refresh()->email)->toBe('ada.lovelace@evault.test');
});

it('changes nothing when the current password is not the right one', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'current_password' => 'no-es-esta',
    ]))
        ->assertUnauthorized();

    expect($this->user->refresh()->email)->toBe('ada@evault.test');
});

/*
 * THE TEST THAT MATTERS IN THIS FILE, and that is why it compares the two responses
 * instead of checking each on its own: if an already registered email answered
 * differently from a wrong password, anybody with a session could work out which
 * accounts exist in the instance by trying them one at a time.
 *
 * It is the same care ADR-008 took when discarding the prelogin endpoint and that #126
 * took in the recovery one.
 */
it('answers the same to an already registered email as to a wrong password', function (): void {
    User::factory()->create(['email' => 'ocupado@evault.test']);

    actAsSession($this->user);

    $takenResponse = $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => 'ocupado@evault.test',
    ]));

    $wrongPassword = $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'current_password' => 'no-es-esta',
    ]));

    expect($takenResponse->status())->toBe($wrongPassword->status())
        ->and($takenResponse->json())->toBe($wrongPassword->json());
});

it('allows changing to the email one already has, which is no conflict', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => 'ada@evault.test',
    ]))
        ->assertNoContent();
});

it('touches neither the items nor their updated_at', function (): void {
    /*
     * ADR-008's dividend: the vault key does not change, it is only re-wrapped, so the
     * operation costs the same with three entries as with three thousand.
     */
    $item = VaultItem::factory()->for($this->vault)->create();
    $before = $item->updated_at;

    $this->travel(1)->minutes();

    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id))
        ->assertNoContent();

    expect($item->refresh()->updated_at->equalTo($before))->toBeTrue();
});

it('refuses a vault that is not the user\'s', function (): void {
    $other = User::factory()->withPersonalVault()->create();

    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($other->personalVault->id))
        ->assertNotFound();

    expect($this->user->refresh()->email)->toBe('ada@evault.test');
});

it('demands re-wrapping every vault and not merely some', function (): void {
    // Leaving one out leaves it wrapped under a key derived from an email that no
    // longer exists, and that does not show until somebody tries to open it.
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'wrapped_keys' => [],
    ]))
        ->assertUnprocessable();
});

it('demands an email shaped like an email', function (): void {
    actAsSession($this->user);

    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id, [
        'email' => 'esto-no-es-un-correo',
    ]))
        ->assertUnprocessable();
});

it('does not allow changing the email with no session', function (): void {
    $this->putJson('/api/auth/email', changeEmailPayload($this->vault->id))
        ->assertUnauthorized();
});
