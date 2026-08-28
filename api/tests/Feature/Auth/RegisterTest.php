<?php

declare(strict_types=1);

use App\Models\User;

/*
 * The sign-up body is built by registrationData(), in tests/Pest.php. The tests that
 * check what happens when something is missing remove it explicitly, which reads
 * better than its absence from a list of five fields.
 */

it('registers a user and returns a token', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    $response->assertCreated()
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonPath('data.user.name', 'Ada Lovelace')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'created_at'], 'token']]);

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
});

/*
 * The invariant everything else leans on: whoever signs up comes out with a vault. It
 * is checked over HTTP and not only in the service because what matters is that it
 * happens on the real path.
 */
it('leaves the user with their personal vault', function (): void {
    $this->postJson('/api/auth/register', registrationData())->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    expect($user->personalVault)->not->toBeNull()
        ->and($user->vaults)->toHaveCount(1);

    $this->assertDatabaseCount('vaults', 1);
});

/*
 * Since ADR-008, coming out of the sign-up with a vault is no longer enough: it takes
 * coming out with the key that opens it. A user with a vault and no wrapped key would
 * have an irreparable account, because the key lived on the device of whoever signed
 * up and nowhere else.
 */
it('stores the wrapped vault key the client sends', function (): void {
    $this->postJson('/api/auth/register', registrationData([
        'wrapped_key' => 'la-clave-envuelta',
        'wrapped_key_iv' => 'el-nonce',
    ]))->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    $this->assertDatabaseHas('vault_members', [
        'vault_id' => $user->personalVault?->id,
        'user_id' => $user->id,
        'wrapped_key' => 'la-clave-envuelta',
        'wrapped_key_iv' => 'el-nonce',
    ]);
});

/*
 * The server cannot open the wrapped key, so it cannot opine on it either. Storing it
 * exactly as it arrived is the only correct behaviour: interpreting it would mean
 * putting the payload through PHP, and every round trip is a chance to corrupt
 * something nobody else can reconstruct.
 */
it('stores the wrapped key as it stands, without interpreting it', function (): void {
    $odd = 'no-es-base64 {"json":"falso"} ñ 漢字 \\x00';

    $this->postJson('/api/auth/register', registrationData(['wrapped_key' => $odd]))
        ->assertCreated();

    $this->assertDatabaseHas('vault_members', ['wrapped_key' => $odd]);
});

/*
 * The response contract does not change with the arrival of the wrapped key: it
 * carries the same fields as in Iteration 1 and no more. See ADR-001 on why the
 * contract has to stay stable, and #53 on why the vault is discovered through its own
 * endpoint instead of being smuggled in here.
 */
it('does not leak the vault in the sign-up response', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    expect(array_keys($response->json('data')))->toBe(['user', 'token'])
        ->and(array_keys($response->json('data.user')))
        ->toBe(['id', 'name', 'email', 'created_at', 'has_recovery_key']);
});

/*
 * `has_recovery_key` arrived in #222 and here it is always false, which is right:
 * whoever has just signed up has no recovery key yet. It is checked separately because
 * the test above only looks at the NAMES of the fields, and a boolean that always came
 * out inverted would pass all the same.
 */
it('says a freshly registered user has no recovery key', function (): void {
    $this->postJson('/api/auth/register', registrationData())
        ->assertJsonPath('data.user.has_recovery_key', false);
});

/*
 * Neither the wrapped key nor its nonce come back in the response. They would be no
 * secret — the client has just sent them — but returning what was not asked for widens
 * the contract for no reason, and this is the endpoint ADR-001 asks not to touch.
 */
it('does not return the wrapped key it has just received', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    expect($response->json('data'))->not->toHaveKeys(['wrapped_key', 'wrapped_key_iv'])
        ->and($response->json('data.user'))->not->toHaveKeys(['wrapped_key', 'wrapped_key_iv']);
});

it('never returns the password in the response', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    expect($response->json('data.user'))->not->toHaveKeys(['password', 'remember_token']);
});

/*
 * Since Iteration 3 what arrives in `password` is the authentication hash the client
 * derived, not the master password. The server still hashes it just the same, and that
 * is precisely the point: to it, it never stopped being an opaque string, which is
 * what let the contract stay unchanged. See ADR-008.
 */
it('hashes what it receives instead of storing it in the clear', function (): void {
    $this->postJson('/api/auth/register', registrationData())->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    expect($user->password)->not->toBe('contraseña-larga')
        ->and(Hash::check('contraseña-larga', $user->password))->toBeTrue();
});

it('issues a token that works for authenticating', function (): void {
    $token = $this->postJson('/api/auth/register', registrationData())->json('data.token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.email', 'ada@evault.test');
});

it('refuses an email that is already registered', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    $this->postJson('/api/auth/register', registrationData(['name' => 'Otra Ada']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});

/*
 * The email is normalised before uniqueness is checked, so two sign-ups differing only
 * in case are the same account and the second has to fail.
 *
 * Since ADR-008 this normalisation stopped being merely a convenience: the email is
 * the salt the client derives with, so the server's and the client's have to agree or
 * the user could not sign in afterwards.
 */
it('treats the email as case insensitive', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    $this->postJson('/api/auth/register', registrationData([
        'name' => 'Otra Ada',
        'email' => 'ADA@evault.test',
    ]))->assertStatus(422);
});

it('normalises the email it stores', function (): void {
    $this->postJson('/api/auth/register', registrationData(['email' => '  ADA@Evault.Test  ']))
        ->assertCreated();

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
});

it('demands all five fields', function (): void {
    $this->postJson('/api/auth/register', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'email', 'password', 'wrapped_key', 'wrapped_key_iv']);
});

/*
 * One at a time and not merely all together: what has to be prevented is precisely the
 * sign-up missing the key, which is the one that would produce the irreparable
 * account.
 */
it('refuses a sign-up with no wrapped key', function (string $field): void {
    $data = registrationData();
    unset($data[$field]);

    $this->postJson('/api/auth/register', $data)
        ->assertStatus(422)
        ->assertJsonValidationErrors($field);

    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('vaults', 0);
})->with(['wrapped_key', 'wrapped_key_iv']);

it('refuses a password that is too short', function (): void {
    $this->postJson('/api/auth/register', registrationData(['password' => 'corta']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('password');
});

it('refuses an email with an invalid format', function (): void {
    $this->postJson('/api/auth/register', registrationData(['email' => 'esto-no-es-un-email']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});
