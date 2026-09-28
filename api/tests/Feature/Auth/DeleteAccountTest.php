<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Models\Passkey;
use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/*
 * Deleting the account. See ADR-024.
 *
 * What this file protects is the promise the screen makes: that nothing of the account
 * is left in the database afterwards, checked table by table and not by trusting the
 * cascades; that it takes the master password AND the email; and that it touches no
 * other account.
 */

beforeEach(function (): void {
    Cache::flush();
});

/**
 * An account with everything an account can have: a vault, live and binned items, a
 * passkey, a recovery key and two sessions.
 *
 * @return array{user: User, token: string}
 */
function aFullAccount(string $email): array
{
    $user = User::factory()->withPersonalVault()->create([
        'email' => $email,
        'password' => 'hash-actual',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ]);
    $vault = $user->personalVault;

    DB::table('vault_members')->where('user_id', $user->id)->update([
        'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
        'recovery_wrapped_key_iv' => 'nonce',
    ]);
    VaultItem::factory()->create(['vault_id' => $vault->id]);
    VaultItem::factory()->create(['vault_id' => $vault->id])->delete();
    Passkey::factory()->create(['user_id' => $user->id, 'vault_id' => $vault->id]);
    $user->createToken('extension', ['*'], now()->addHours(12));

    return ['user' => $user, 'token' => $user->createToken('web', ['*'], now()->addHours(12))->plainTextToken];
}

/** Every row anywhere that still belongs to that account. */
function rowsLeftOf(int $userId, string $vaultId): array
{
    return [
        'users' => DB::table('users')->where('id', $userId)->count(),
        'vaults' => DB::table('vaults')->where('id', $vaultId)->count(),
        'vault_members' => DB::table('vault_members')->where('user_id', $userId)->orWhere('vault_id', $vaultId)->count(),
        // The raw table and not the model, which would leave the bin out of the count.
        'vault_items' => DB::table('vault_items')->where('vault_id', $vaultId)->count(),
        'passkeys' => DB::table('passkeys')->where('user_id', $userId)->count(),
        'personal_access_tokens' => DB::table('personal_access_tokens')
            ->where('tokenable_id', $userId)->where('tokenable_type', User::class)->count(),
    ];
}

it('leaves nothing of the account anywhere, bin and tokens included', function (): void {
    ['user' => $ada, 'token' => $token] = aFullAccount('ada@evault.test');
    $vaultId = $ada->personalVault->id;

    expect(array_sum(rowsLeftOf($ada->id, $vaultId)))->toBeGreaterThan(6);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => 'ada@evault.test'])
        ->assertNoContent();

    expect(rowsLeftOf($ada->id, $vaultId))->toBe([
        'users' => 0,
        'vaults' => 0,
        'vault_members' => 0,
        'vault_items' => 0,
        'passkeys' => 0,
        'personal_access_tokens' => 0,
    ]);
});

it('touches nothing of another account', function (): void {
    ['user' => $ada, 'token' => $token] = aFullAccount('ada@evault.test');
    ['user' => $grace] = aFullAccount('grace@evault.test');
    $before = rowsLeftOf($grace->id, $grace->personalVault->id);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => 'ada@evault.test'])
        ->assertNoContent();

    expect(rowsLeftOf($grace->id, $grace->personalVault->id))->toBe($before);
});

it('a wrong master password deletes nothing', function (): void {
    ['user' => $ada, 'token' => $token] = aFullAccount('ada@evault.test');
    $before = rowsLeftOf($ada->id, $ada->personalVault->id);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/auth/account', ['current_password' => 'otra', 'email' => 'ada@evault.test'])
        ->assertUnauthorized();

    expect(rowsLeftOf($ada->id, $ada->personalVault->id))->toBe($before);
});

/*
 * The email typed by hand is the second half of the proof (ADR-024 §2.5), and its
 * refusal must not say which half was wrong.
 */
it('another account\'s email deletes nothing, and answers exactly like a wrong password', function (): void {
    ['user' => $ada, 'token' => $token] = aFullAccount('ada@evault.test');
    aFullAccount('grace@evault.test');
    $before = rowsLeftOf($ada->id, $ada->personalVault->id);
    $as = fn () => $this->withHeader('Authorization', "Bearer {$token}");

    $wrongEmail = $as()->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => 'grace@evault.test']);
    $wrongPassword = $as()->deleteJson('/api/auth/account', ['current_password' => 'otra', 'email' => 'ada@evault.test']);

    expect($wrongEmail->status())->toBe(401)
        ->and($wrongEmail->json())->toBe($wrongPassword->json())
        ->and(rowsLeftOf($ada->id, $ada->personalVault->id))->toBe($before);
});

it('takes the email as the login does, whatever its case and spaces', function (): void {
    ['token' => $token] = aFullAccount('ada@evault.test');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => '  ADA@Evault.Test '])
        ->assertNoContent();

    expect(User::query()->where('email', 'ada@evault.test')->exists())->toBeFalse();
});

it('demands both fields', function (): void {
    ['token' => $token] = aFullAccount('ada@evault.test');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/auth/account', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['current_password', 'email']);
});

it('demands a session, and a recovery token is not enough', function (): void {
    ['user' => $ada] = aFullAccount('ada@evault.test');
    $recovery = $ada->createToken(
        AccessTokens::RECOVERY_NAME, [AccessTokens::RECOVERY_ABILITY], now()->addMinutes(15),
    )->plainTextToken;
    $body = ['current_password' => 'hash-actual', 'email' => 'ada@evault.test'];

    $this->deleteJson('/api/auth/account', $body)->assertUnauthorized();
    $this->withHeader('Authorization', "Bearer {$recovery}")->deleteJson('/api/auth/account', $body)->assertForbidden();

    expect(User::query()->whereKey($ada->id)->exists())->toBeTrue();
});

it('the token that asked no longer works afterwards', function (): void {
    ['token' => $token] = aFullAccount('ada@evault.test');
    $as = fn () => $this->withHeader('Authorization', "Bearer {$token}");

    $as()->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => 'ada@evault.test'])
        ->assertNoContent();

    $this->app['auth']->forgetGuards();
    $as()->getJson('/api/auth/me')->assertUnauthorized();
});

/*
 * ADR-024 §2.6: nothing is left, and the email is free for a new, empty account.
 */
it('leaves the email free to sign up again', function (): void {
    ['token' => $token] = aFullAccount('ada@evault.test');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => 'ada@evault.test'])
        ->assertNoContent();

    $this->app['auth']->forgetGuards();
    $this->withoutHeader('Authorization')->postJson('/api/auth/register', [
        'name' => 'Ada', 'email' => 'ada@evault.test', 'password' => 'otra-contraseña',
        'wrapped_key' => 'k', 'wrapped_key_iv' => 'iv',
    ])->assertCreated();
});

it('stops after five wrong attempts in an hour, counted per account', function (): void {
    ['token' => $token] = aFullAccount('ada@evault.test');
    $as = fn () => $this->withHeader('Authorization', "Bearer {$token}");
    $wrong = ['current_password' => 'otra', 'email' => 'ada@evault.test'];

    foreach (range(1, 5) as $attempt) {
        $as()->deleteJson('/api/auth/account', $wrong)->assertUnauthorized();
    }

    $as()->deleteJson('/api/auth/account', ['current_password' => 'hash-actual', 'email' => 'ada@evault.test'])
        ->assertTooManyRequests();
    expect(User::query()->where('email', 'ada@evault.test')->exists())->toBeTrue();
});
