<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;

it('demands authentication', function (): void {
    $this->getJson('/api/vaults')->assertUnauthorized();
});

/*
 * The case that makes the endpoint useful: whoever has just signed up needs to know
 * which vault they operate on before they can ask for anything else. It is done over
 * HTTP end to end, with the token the sign-up itself returns, because that is exactly
 * the sequence the SPA is going to run.
 */
it('a freshly registered user receives a single vault, the personal one', function (): void {
    $token = $this->postJson('/api/auth/register', registrationData())
        ->assertCreated()
        ->json('data.token');

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk();

    $response->assertJsonCount(1, 'data.vaults')
        ->assertJsonPath('data.vaults.0.is_personal', true)
        ->assertJsonPath('data.vaults.0.role', VaultRole::Owner->value);
});

it('returns only the authenticated user\'s vaults', function (): void {
    $ada = User::factory()->withPersonalVault()->create();
    $grace = User::factory()->withPersonalVault()->create();

    $token = $ada->createToken('api')->plainTextToken;

    $vaults = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->json('data.vaults');

    expect($vaults)->toHaveCount(1)
        ->and($vaults[0]['id'])->toBe($ada->personalVault?->id)
        ->and(array_column($vaults, 'id'))->not->toContain($grace->personalVault?->id);
});

it('exposes only the fields of the contract', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $token = $user->createToken('api')->plainTextToken;

    $vault = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->json('data.vaults.0');

    expect(array_keys($vault))
        ->toBe(['id', 'name', 'is_personal', 'role', 'wrapped_key', 'wrapped_key_iv']);
});

/*
 * The endpoint that makes opening the vault possible. Without the wrapped key, a
 * freshly authenticated client knows which vault it operates on but cannot decrypt
 * anything inside it.
 *
 * It travels here and not in the login response on purpose: it belongs to the vault
 * and not to the session, and this way the contract of /api/auth does not change. See
 * ADR-008.
 */
it('returns the wrapped key the user opens their vault with', function (): void {
    $user = User::factory()
        ->withPersonalVault(wrappedKey('la-clave-de-ada', 'el-nonce-de-ada'))
        ->create();

    $token = $user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->assertJsonPath('data.vaults.0.wrapped_key', 'la-clave-de-ada')
        ->assertJsonPath('data.vaults.0.wrapped_key_iv', 'el-nonce-de-ada');
});

/*
 * Isolation over the new datum, which is the costliest one to leak: somebody else's
 * wrapped key is the only thing missing for whoever knows their master password. That
 * the query starts from $user->vaults() makes it structurally hard, and this test is
 * what stops a refactor from undoing it without warning.
 */
it('never returns another user\'s wrapped key', function (): void {
    $ada = User::factory()->withPersonalVault(wrappedKey('la-de-ada', 'nonce-ada'))->create();
    User::factory()->withPersonalVault(wrappedKey('la-de-grace', 'nonce-grace'))->create();

    $token = $ada->createToken('api')->plainTextToken;

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk();

    expect($response->json('data.vaults'))->toHaveCount(1)
        ->and($response->getContent())->toContain('la-de-ada')
        ->and($response->getContent())->not->toContain('la-de-grace');
});

/*
 * It carries no item count on purpose: the client downloads the whole vault, so it
 * does not need the server to count anything for it. Pinning it in a test keeps one
 * from slipping in later as though it were an innocent improvement.
 */
it('includes no counters and nothing the server could deduce from the content', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $token = $user->createToken('api')->plainTextToken;

    $vault = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->json('data.vaults.0');

    expect($vault)->not->toHaveKeys(['items_count', 'items', 'personal_for_user_id']);
});

/*
 * A vault one is a member of without it being anybody's personal one. It cannot be
 * created through the API yet, but the model already admits it and it is worth pinning
 * now that is_personal tells them apart properly, before shared vaults arrive.
 */
it('marks as not personal a vault one is merely a member of', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $shared = Vault::factory()->create(['name' => 'Equipo']);
    $shared->members()->attach($user->id, membership());

    $token = $user->createToken('api')->plainTextToken;

    $vaults = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->json('data.vaults');

    expect($vaults)->toHaveCount(2);

    $byName = array_column($vaults, 'is_personal', 'name');

    expect($byName['Equipo'])->toBeFalse()
        ->and($byName['Personal'])->toBeTrue();
});

/*
 * An explicit criterion of the issue. The vault could have been smuggled into
 * /api/auth/me, which was cheaper while every user has one, and it was decided not to
 * so as not to touch a contract kept stable until Iteration 3.
 *
 * That reason has since expired, but the test stays because its value is another one
 * and does not expire: enumerating the EXACT keys stops an attribute from slipping
 * into the response merely by having been added to the table. When this test goes red
 * the question is whether the new field was meant to come out of there, not to update
 * the list and move on.
 *
 * `has_recovery_key` was added in #222 answering that question: the email-change
 * screen needs it to know whether it has to hand over a new recovery key, and cannot
 * deduce it from anything else. It is a derived boolean; the hash does not come out of
 * here.
 */
it('does not change the contract of /api/auth/me', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $token = $user->createToken('api')->plainTextToken;

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk();

    expect(array_keys($response->json('data')))->toBe(['user'])
        ->and(array_keys($response->json('data.user')))
        ->toBe(['id', 'name', 'email', 'created_at', 'has_recovery_key']);
});
