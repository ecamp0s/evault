<?php

declare(strict_types=1);

use App\Application\Auth\AccessTokens;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/*
 * Recuperar el acceso con la clave de recuperación. Ver ADR-010.
 *
 * Es el segundo camino a la vault, y hasta la Iteración 4 solo había uno. Casi todo
 * lo que se comprueba aquí es que ese camino no filtre más de lo que filtra el
 * login, que es la parte que puede salir cara.
 */

beforeEach(function (): void {
    Cache::flush();

    $this->user = User::factory()->conVaultPersonal()->create(['email' => 'ada@evault.test']);
    $this->vault = $this->user->personalVault;

    actuarComoSesion($this->user);

    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-recuperacion',
        'wrapped_keys' => [[
            'vault_id' => $this->vault->id,
            'recovery_wrapped_key' => 'envoltorio-de-recuperacion',
            'recovery_wrapped_key_iv' => 'nonce-de-recuperacion',
        ]],
    ])->assertNoContent();

    // El resto de los tests llama al endpoint público, sin sesión.
    olvidarSesionResuelta();
});

it('entrega el envoltorio a quien tiene la clave de recuperación', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ])
        ->assertOk()
        ->assertJsonPath('data.wrapped_keys.0.vault_id', $this->vault->id)
        ->assertJsonPath('data.wrapped_keys.0.recovery_wrapped_key', 'envoltorio-de-recuperacion')
        ->assertJsonPath('data.wrapped_keys.0.recovery_wrapped_key_iv', 'nonce-de-recuperacion')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email'], 'wrapped_keys', 'token']]);
});

it('normaliza el correo igual que el login', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => '  ADA@evault.test ',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ])->assertOk();
});

it('rechaza una clave de recuperación incorrecta con 401', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'no-es-la-suya',
    ])->assertUnauthorized();
});

it('rechaza un correo que no existe con 401', function (): void {
    $this->postJson('/api/auth/recover', [
        'email' => 'nadie@evault.test',
        'recovery_auth_hash' => 'da-igual-cual',
    ])->assertUnauthorized();
});

/*
 * Los tres fallos posibles tienen que ser indistinguibles desde fuera, y son uno
 * más que en el login: aquí existe además el usuario que nunca registró una clave
 * de recuperación. Distinguirlo diría quién tiene segunda llave y quién no, que es
 * un dato que el login no filtra y que este endpoint no va a estrenar.
 */
it('no revela si el correo existe ni si tiene clave de recuperación', function (): void {
    $sinClave = User::factory()->conVaultPersonal()->create(['email' => 'sin-clave@evault.test']);

    $inexistente = $this->postJson('/api/auth/recover', [
        'email' => 'nadie@evault.test',
        'recovery_auth_hash' => 'da-igual-cual',
    ]);

    $claveMala = $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'no-es-la-suya',
    ]);

    $sinRegistrar = $this->postJson('/api/auth/recover', [
        'email' => $sinClave->email,
        'recovery_auth_hash' => 'da-igual-cual',
    ]);

    expect($claveMala->status())->toBe($inexistente->status())
        ->and($sinRegistrar->status())->toBe($inexistente->status())
        ->and($claveMala->json('message'))->toBe($inexistente->json('message'))
        ->and($sinRegistrar->json('message'))->toBe($inexistente->json('message'));
});

/*
 * Aislamiento: la respuesta solo puede llevar los envoltorios de quien demuestra la
 * clave. Obligatorio por ADR-004.
 */
it('nunca devuelve el envoltorio de recuperación de otro', function (): void {
    $otra = User::factory()->conVaultPersonal()->create(['email' => 'otra@evault.test']);

    actuarComoSesion($otra);
    $this->postJson('/api/auth/recovery-key', [
        'recovery_auth_hash' => 'hash-de-otra',
        'wrapped_keys' => [[
            'vault_id' => $otra->personalVault->id,
            'recovery_wrapped_key' => 'envoltorio-de-otra',
            'recovery_wrapped_key_iv' => 'nonce-de-otra',
        ]],
    ]);
    olvidarSesionResuelta();

    $respuesta = $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'hash-de-recuperacion',
    ])->assertOk();

    expect($respuesta->json('data.wrapped_keys'))->toHaveCount(1)
        ->and($respuesta->json('data.wrapped_keys.0.vault_id'))->toBe($this->vault->id)
        ->and(json_encode($respuesta->json()))->not->toContain('envoltorio-de-otra');
});

it('limita los intentos y responde 429', function (): void {
    $limite = (int) config('throttling.recovery.attempts');

    for ($i = 0; $i < $limite; $i++) {
        $this->postJson('/api/auth/recover', [
            'email' => 'ada@evault.test',
            'recovery_auth_hash' => 'no-es-la-suya',
        ])->assertUnauthorized();
    }

    $this->postJson('/api/auth/recover', [
        'email' => 'ada@evault.test',
        'recovery_auth_hash' => 'no-es-la-suya',
    ])->assertStatus(429)->assertHeader('Retry-After');
});

/*
 * El límite de recuperación es más estricto que el de login, y no por simetría: el
 * perfil de uso es distinto. Si alguien iguala los dos números sin querer, este test
 * lo dice.
 */
it('limita la recuperación más que el login', function (): void {
    expect((int) config('throttling.recovery.attempts'))
        ->toBeLessThan((int) config('throttling.login.intentos'));
});

/*
 * El token que devuelve la recuperación es lo más delicado de este endpoint: quien
 * lo recibe ha demostrado tener la clave de recuperación, pero todavía no sabe
 * ninguna contraseña maestra. Si abriera la vault, el papel valdría por la cuenta
 * entera sin más pasos. Ver ADR-010.
 */
describe('el token de recuperación', function (): void {
    beforeEach(function (): void {
        $this->token = $this->postJson('/api/auth/recover', [
            'email' => 'ada@evault.test',
            'recovery_auth_hash' => 'hash-de-recuperacion',
        ])->json('data.token');
    });

    it('no sirve para listar los vaults', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson('/api/vaults')
            ->assertForbidden();
    });

    it('no sirve para leer los items de la vault', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson("/api/vaults/{$this->vault->id}/items")
            ->assertForbidden();
    });

    it('no sirve para consultar la sesión ni para cerrarla', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson('/api/auth/me')
            ->assertForbidden();

        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson('/api/auth/logout')
            ->assertForbidden();
    });

    it('no sirve para sustituir la clave de recuperación', function (): void {
        $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson('/api/auth/recovery-key', [
                'recovery_auth_hash' => 'la-del-atacante',
                'wrapped_keys' => [[
                    'vault_id' => $this->vault->id,
                    'recovery_wrapped_key' => 'envoltorio-del-atacante',
                    'recovery_wrapped_key_iv' => 'nonce',
                ]],
            ])
            ->assertForbidden();
    });

    it('lleva solo la capacidad de terminar la recuperación', function (): void {
        $token = $this->user->tokens()->where('name', AccessTokens::RECOVERY_NAME)->firstOrFail();

        expect($token->abilities)->toBe([AccessTokens::RECOVERY_ABILITY]);
    });

    it('caduca', function (): void {
        $token = $this->user->tokens()->where('name', AccessTokens::RECOVERY_NAME)->firstOrFail();

        expect($token->expires_at)->not->toBeNull()
            ->and($token->expires_at->isBefore(now()->addMinutes(AccessTokens::RECOVERY_MINUTES + 1)))->toBeTrue();
    });
});
