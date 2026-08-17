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

it('devuelve solo los vaults del usuario autenticado', function (): void {
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

it('expone solo los campos del contrato', function (): void {
    $user = User::factory()->withPersonalVault()->create();
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
 * Aislamiento sobre el dato nuevo, que es el que más caro se paga si se filtra: la
 * clave envuelta de otro es lo único que le falta a quien conozca su contraseña
 * maestra. Que la consulta arranque de $user->vaults() lo hace estructuralmente
 * difícil, y este test es lo que impide que un refactor lo deshaga sin avisar.
 */
it('nunca devuelve la clave envuelta de otro usuario', function (): void {
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
 * No lleva contador de items a propósito: el cliente se descarga la vault entera,
 * así que no necesita que el servidor le cuente nada. Fijarlo en un test evita que
 * se cuele más adelante como si fuera una mejora inocente.
 */
it('no incluye contadores ni nada que el servidor pueda deducir del contenido', function (): void {
    $user = User::factory()->withPersonalVault()->create();
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
 * Criterio explícito del issue. El vault podría haberse colado en /api/auth/me,
 * que era más barato mientras cada usuario tenga uno, y se decidió no hacerlo para
 * no tocar un contrato que se mantiene estable hasta la Iteración 3.
 *
 * Ese motivo ya expiró, pero el test se queda porque su valor es otro y no caduca:
 * enumerar las claves EXACTAS impide que un atributo se cuele en la respuesta solo
 * por haberse añadido a la tabla. Cuando este test se pone rojo hay que preguntarse
 * si el campo nuevo tenía que salir de ahí, y no actualizar la lista sin más.
 *
 * `has_recovery_key` se añadió en #222 respondiendo a esa pregunta: la pantalla de
 * cambio de correo lo necesita para saber si tiene que entregar una clave de
 * recuperación nueva, y no puede deducirlo de ninguna otra cosa. Es un booleano
 * derivado; el hash no sale de aquí.
 */
it('no cambia el contrato de /api/auth/me', function (): void {
    $user = User::factory()->withPersonalVault()->create();
    $token = $user->createToken('api')->plainTextToken;

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk();

    expect(array_keys($response->json('data')))->toBe(['user'])
        ->and(array_keys($response->json('data.user')))
        ->toBe(['id', 'name', 'email', 'created_at', 'has_recovery_key']);
});
