<?php

declare(strict_types=1);

use App\Models\User;
use App\Models\Vault;
use App\Models\VaultRole;

it('exige autenticación', function (): void {
    $this->getJson('/api/vaults')->assertUnauthorized();
});

/*
 * El caso que hace útil el endpoint: quien acaba de registrarse necesita saber
 * sobre qué vault opera antes de poder pedir nada más. Se hace por HTTP de punta a
 * punta, con el token que devuelve el propio registro, porque es exactamente la
 * secuencia que va a ejecutar la SPA.
 */
it('un usuario recién registrado recibe un único vault, el personal', function (): void {
    $token = $this->postJson('/api/auth/register', datosDeRegistro())
        ->assertCreated()
        ->json('data.token');

    $respuesta = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk();

    $respuesta->assertJsonCount(1, 'data.vaults')
        ->assertJsonPath('data.vaults.0.is_personal', true)
        ->assertJsonPath('data.vaults.0.role', VaultRole::Owner->value);
});

it('devuelve solo los vaults del usuario autenticado', function (): void {
    $ada = User::factory()->conVaultPersonal()->create();
    $grace = User::factory()->conVaultPersonal()->create();

    $token = $ada->createToken('api')->plainTextToken;

    $vaults = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->json('data.vaults');

    expect($vaults)->toHaveCount(1)
        ->and($vaults[0]['id'])->toBe($ada->personalVault?->id)
        ->and(array_column($vaults, 'id'))->not->toContain($grace->personalVault?->id);
});

it('expone solo los campos del contrato', function (): void {
    $user = User::factory()->conVaultPersonal()->create();
    $token = $user->createToken('api')->plainTextToken;

    $vault = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->json('data.vaults.0');

    expect(array_keys($vault))
        ->toBe(['id', 'name', 'is_personal', 'role', 'wrapped_key', 'wrapped_key_iv']);
});

/*
 * El endpoint que permite abrir la vault. Sin la clave envuelta, un cliente recién
 * autenticado sabe sobre qué vault opera pero no puede descifrar nada de lo que hay
 * dentro.
 *
 * Viaja aquí y no en la respuesta del login a propósito: es un dato del vault y no
 * de la sesión, y así el contrato de /api/auth no cambia. Ver ADR-008.
 */
it('devuelve la clave envuelta con la que el usuario abre su vault', function (): void {
    $user = User::factory()
        ->conVaultPersonal(claveEnvuelta('la-clave-de-ada', 'el-nonce-de-ada'))
        ->create();

    $token = $user->createToken('api')->plainTextToken;

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->assertJsonPath('data.vaults.0.wrapped_key', 'la-clave-de-ada')
        ->assertJsonPath('data.vaults.0.wrapped_key_iv', 'el-nonce-de-ada');
});

/*
 * Aislamiento sobre el dato nuevo, que es el que más caro se paga si se filtra: la
 * clave envuelta de otro es lo único que le falta a quien conozca su contraseña
 * maestra. Que la consulta arranque de $user->vaults() lo hace estructuralmente
 * difícil, y este test es lo que impide que un refactor lo deshaga sin avisar.
 */
it('nunca devuelve la clave envuelta de otro usuario', function (): void {
    $ada = User::factory()->conVaultPersonal(claveEnvuelta('la-de-ada', 'nonce-ada'))->create();
    User::factory()->conVaultPersonal(claveEnvuelta('la-de-grace', 'nonce-grace'))->create();

    $token = $ada->createToken('api')->plainTextToken;

    $respuesta = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk();

    expect($respuesta->json('data.vaults'))->toHaveCount(1)
        ->and($respuesta->getContent())->toContain('la-de-ada')
        ->and($respuesta->getContent())->not->toContain('la-de-grace');
});

/*
 * No lleva contador de items a propósito: el cliente se descarga la vault entera,
 * así que no necesita que el servidor le cuente nada. Fijarlo en un test evita que
 * se cuele más adelante como si fuera una mejora inocente.
 */
it('no incluye contadores ni nada que el servidor pueda deducir del contenido', function (): void {
    $user = User::factory()->conVaultPersonal()->create();
    $token = $user->createToken('api')->plainTextToken;

    $vault = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->json('data.vaults.0');

    expect($vault)->not->toHaveKeys(['items_count', 'items', 'personal_for_user_id']);
});

/*
 * Un vault del que se es miembro sin ser el personal de nadie. Todavía no se puede
 * crear por API, pero el modelo ya lo admite y conviene fijar ahora que is_personal
 * distingue bien, antes de que llegue el plan Team.
 */
it('marca como no personal un vault del que solo se es miembro', function (): void {
    $user = User::factory()->conVaultPersonal()->create();
    $compartido = Vault::factory()->create(['name' => 'Equipo']);
    $compartido->members()->attach($user->id, pertenencia());

    $token = $user->createToken('api')->plainTextToken;

    $vaults = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/vaults')
        ->assertOk()
        ->json('data.vaults');

    expect($vaults)->toHaveCount(2);

    $porNombre = array_column($vaults, 'is_personal', 'name');

    expect($porNombre['Equipo'])->toBeFalse()
        ->and($porNombre['Personal'])->toBeTrue();
});

/*
 * Criterio explícito del issue. El vault podría haberse colado en /api/auth/me,
 * que era más barato mientras cada usuario tenga uno, y se decidió no hacerlo para
 * no tocar un contrato que se mantiene estable hasta la Iteración 3.
 */
it('no cambia el contrato de /api/auth/me', function (): void {
    $user = User::factory()->conVaultPersonal()->create();
    $token = $user->createToken('api')->plainTextToken;

    $respuesta = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk();

    expect(array_keys($respuesta->json('data')))->toBe(['user'])
        ->and(array_keys($respuesta->json('data.user')))->toBe(['id', 'name', 'email', 'created_at']);
});
