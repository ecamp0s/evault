<?php

declare(strict_types=1);

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/*
 * Registering, listing and revoking a passkey. See ADR-021 and issue #559.
 */

/**
 * An account with its personal vault and a live session.
 *
 * It goes through actAsSession and not through Sanctum::actingAs directly, and the
 * helper's own comment explains why: without the explicit ['*'] every protected route
 * answers 403, which reads like a permissions bug in the code instead of a badly built
 * test token. Every authenticated route has carried abilities:* since ADR-010.
 */
function anAccount(): User
{
    $user = User::factory()->withPersonalVault()->create();

    actAsSession($user);

    return $user;
}

/** @return array<string, string> */
function aPasskeyPayload(User $user, string $credentialId = 'la-credencial'): array
{
    return [
        'vault_id' => $user->personalVault->id,
        'credential_id' => $credentialId,
        'label' => 'iPhone',
        'rp_id' => 'evault.local',
        'auth_hash' => 'el-hash-derivado-del-prf',
        'wrapped_key' => 'la-clave-envuelta',
        'wrapped_key_iv' => 'el-nonce',
    ];
}

it('registers a passkey and answers with what it stored', function (): void {
    $user = anAccount();

    $response = $this->postJson('/api/auth/passkeys', aPasskeyPayload($user));

    $response->assertCreated()
        ->assertJsonPath('data.label', 'iPhone')
        ->assertJsonPath('data.rp_id', 'evault.local');

    $this->assertDatabaseHas('passkeys', [
        'user_id' => $user->id, 'credential_id' => 'la-credencial',
    ]);
});

/*
 * THE TEST THAT PROTECTS THE THIRD WAY IN. A list that leaked the wrapper would hand
 * one of the three doors to the vault to anybody holding a session token — and a
 * session token is exactly what an attacker has that a master password is not.
 */
it('never puts the wrapper or the hash in a response', function (): void {
    $user = anAccount();

    $created = $this->postJson('/api/auth/passkeys', aPasskeyPayload($user));
    $listed = $this->getJson('/api/auth/passkeys');

    foreach ([$created, $listed] as $response) {
        $body = $response->content();

        expect($body)->not->toContain('la-clave-envuelta')
            ->and($body)->not->toContain('el-nonce')
            ->and($body)->not->toContain('el-hash-derivado-del-prf')
            ->and($body)->not->toContain('wrapped_key')
            ->and($body)->not->toContain('auth_hash');
    }
});

it('lists only the passkeys of whoever asks', function (): void {
    $ada = anAccount();
    $grace = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $ada->id, 'vault_id' => $ada->personalVault->id, 'label' => 'de Ada',
    ]);
    Passkey::factory()->create([
        'user_id' => $grace->id, 'vault_id' => $grace->personalVault->id, 'label' => 'de Grace',
    ]);

    $this->getJson('/api/auth/passkeys')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.label', 'de Ada');
});

it('revokes one and leaves the others alone', function (): void {
    $user = anAccount();

    $revoked = Passkey::factory()->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);
    $kept = Passkey::factory()->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);

    $this->deleteJson("/api/auth/passkeys/{$revoked->id}")->assertNoContent();

    $this->assertDatabaseMissing('passkeys', ['id' => $revoked->id]);
    $this->assertDatabaseHas('passkeys', ['id' => $kept->id]);
});

/*
 * NOT FOUND AND NOT YOURS HAVE TO BE THE SAME ANSWER, and the two responses are
 * compared against EACH OTHER rather than each on its own — the pattern this project
 * uses against enumeration. Asserting 404 twice separately would pass even if one of
 * them started saying something the other did not.
 */
it('does not let anybody tell a passkey that is not theirs from one that does not exist', function (): void {
    anAccount();
    $grace = User::factory()->withPersonalVault()->create();
    $theirs = Passkey::factory()->create([
        'user_id' => $grace->id, 'vault_id' => $grace->personalVault->id,
    ]);

    $somebodyElses = $this->deleteJson("/api/auth/passkeys/{$theirs->id}");
    $nonExistent = $this->deleteJson('/api/auth/passkeys/'.fake()->uuid());

    expect($somebodyElses->status())->toBe($nonExistent->status())
        ->and($somebodyElses->status())->toBe(404)
        ->and($somebodyElses->content())->toBe($nonExistent->content());
});

it('leaves somebody elses passkey where it was', function (): void {
    anAccount();
    $grace = User::factory()->withPersonalVault()->create();
    $theirs = Passkey::factory()->create([
        'user_id' => $grace->id, 'vault_id' => $grace->personalVault->id,
    ]);

    $this->deleteJson("/api/auth/passkeys/{$theirs->id}");

    $this->assertDatabaseHas('passkeys', ['id' => $theirs->id]);
});

/*
 * The double guard on the vault, checked from outside: a vault that is not theirs
 * cannot receive a wrapper. Both barriers answer the same 404.
 */
it('refuses to wrap a vault that belongs to somebody else', function (): void {
    anAccount();
    $grace = User::factory()->withPersonalVault()->create();

    $this->postJson('/api/auth/passkeys', [
        ...aPasskeyPayload($grace),
        'vault_id' => $grace->personalVault->id,
    ])->assertNotFound();

    expect(DB::table('passkeys')->count())->toBe(0);
});

/*
 * Adding the same device twice is a thing people do, because from outside a passkey
 * that already works looks exactly like one that was never added. It has to come back
 * as an answer and not as a 500.
 */
it('refuses the same credential twice, and says so', function (): void {
    $user = anAccount();

    $this->postJson('/api/auth/passkeys', aPasskeyPayload($user))->assertCreated();
    $this->postJson('/api/auth/passkeys', aPasskeyPayload($user))->assertStatus(409);

    expect(DB::table('passkeys')->count())->toBe(1);
});

/*
 * And it answers the same when the credential belongs to somebody else, because telling
 * the two apart would say that a given credential exists somewhere in the instance.
 * The responses are compared against each other, not each on its own.
 */
it('answers the same whether the credential is yours or not', function (): void {
    $user = anAccount();
    $grace = User::factory()->withPersonalVault()->create();

    Passkey::factory()->create([
        'user_id' => $grace->id,
        'vault_id' => $grace->personalVault->id,
        'credential_id' => 'la-de-grace',
    ]);
    $this->postJson('/api/auth/passkeys', aPasskeyPayload($user, 'la-mia'))->assertCreated();

    $mine = $this->postJson('/api/auth/passkeys', aPasskeyPayload($user, 'la-mia'));
    $theirs = $this->postJson('/api/auth/passkeys', aPasskeyPayload($user, 'la-de-grace'));

    expect($mine->status())->toBe($theirs->status())
        ->and($mine->content())->toBe($theirs->content());
});

/*
 * A registration that fails must leave NOTHING, and with one table that is a property
 * of the shape rather than of a transaction: the credential, its hash and its wrapper
 * are a single row. #558 chose that shape for this reason.
 */
it('leaves no half a passkey behind when the write fails', function (): void {
    $user = anAccount();

    $this->postJson('/api/auth/passkeys', [
        ...aPasskeyPayload($user),
        'label' => str_repeat('x', 61),
    ])->assertStatus(422);

    expect(DB::table('passkeys')->count())->toBe(0);
});

it('demands a session for the three of them', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $passkey = Passkey::factory()->create([
        'user_id' => $user->id, 'vault_id' => $user->personalVault->id,
    ]);

    $this->getJson('/api/auth/passkeys')->assertUnauthorized();
    $this->postJson('/api/auth/passkeys', aPasskeyPayload($user))->assertUnauthorized();
    $this->deleteJson("/api/auth/passkeys/{$passkey->id}")->assertUnauthorized();
});
