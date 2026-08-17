<?php

declare(strict_types=1);

use App\Models\User;

/*
 * El cuerpo del alta se construye con datosDeRegistro(), en tests/Pest.php. Los
 * tests que comprueban qué pasa cuando falta algo lo quitan de forma explícita, que
 * se lee mejor que su ausencia en una lista de cinco campos.
 */

it('registra un usuario y devuelve un token', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    $response->assertCreated()
        ->assertJsonPath('data.user.email', 'ada@evault.test')
        ->assertJsonPath('data.user.name', 'Ada Lovelace')
        ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'created_at'], 'token']]);

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
});

/*
 * La invariante sobre la que se apoya todo lo demás: quien se registra sale con
 * vault. Se comprueba por HTTP y no solo en el servicio porque lo que importa es
 * que ocurra en el camino real.
 */
it('deja al usuario con su vault personal', function (): void {
    $this->postJson('/api/auth/register', registrationData())->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    expect($user->personalVault)->not->toBeNull()
        ->and($user->vaults)->toHaveCount(1);

    $this->assertDatabaseCount('vaults', 1);
});

/*
 * Desde ADR-008, salir del alta con vault ya no basta: hace falta salir con la
 * clave que lo abre. Un usuario con vault y sin clave envuelta tendría una cuenta
 * irreparable, porque la clave vivía en el dispositivo de quien se registró y en
 * ningún otro sitio.
 */
it('guarda la clave de vault envuelta que manda el cliente', function (): void {
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
 * El servidor no puede abrir la clave envuelta, así que tampoco puede opinar sobre
 * ella. Guardarla tal cual llegó es la única conducta correcta: interpretarla sería
 * pasar el payload por PHP, y cada conversión de ida y vuelta es una oportunidad de
 * corromper algo que nadie más puede reconstruir.
 */
it('guarda la clave envuelta tal cual, sin interpretarla', function (): void {
    $odd = 'no-es-base64 {"json":"falso"} ñ 漢字 \\x00';

    $this->postJson('/api/auth/register', registrationData(['wrapped_key' => $odd]))
        ->assertCreated();

    $this->assertDatabaseHas('vault_members', ['wrapped_key' => $odd]);
});

/*
 * El contrato de la respuesta no cambia con la llegada de la clave envuelta: lleva
 * los mismos campos que en la Iteración 1 y ninguno más. Ver ADR-001 sobre por qué
 * el contrato debe mantenerse estable, y #53 sobre por qué el vault se descubre en
 * su propio endpoint y no colándolo aquí.
 */
it('no filtra el vault en la respuesta del registro', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    expect(array_keys($response->json('data')))->toBe(['user', 'token'])
        ->and(array_keys($response->json('data.user')))
        ->toBe(['id', 'name', 'email', 'created_at', 'has_recovery_key']);
});

/*
 * `has_recovery_key` entró en #222 y aquí siempre es false, que es lo correcto: quien
 * acaba de registrarse no tiene clave de recuperación todavía. Se comprueba aparte
 * porque el test de arriba solo mira los NOMBRES de los campos, y un booleano que
 * siempre viniera al revés pasaría igual.
 */
it('dice que un recién registrado no tiene clave de recuperación', function (): void {
    $this->postJson('/api/auth/register', registrationData())
        ->assertJsonPath('data.user.has_recovery_key', false);
});

/*
 * Ni la clave envuelta ni su nonce vuelven en la respuesta. No serían un secreto
 * —el cliente acaba de mandarlos— pero devolver lo que no se ha pedido ensancha el
 * contrato sin motivo, y este es el endpoint que ADR-001 pide no tocar.
 */
it('no devuelve la clave envuelta que acaba de recibir', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    expect($response->json('data'))->not->toHaveKeys(['wrapped_key', 'wrapped_key_iv'])
        ->and($response->json('data.user'))->not->toHaveKeys(['wrapped_key', 'wrapped_key_iv']);
});

it('nunca devuelve la contraseña en la respuesta', function (): void {
    $response = $this->postJson('/api/auth/register', registrationData());

    expect($response->json('data.user'))->not->toHaveKeys(['password', 'remember_token']);
});

/*
 * Desde la Iteración 3 lo que llega en `password` es el hash de autenticación que
 * derivó el cliente, no la contraseña maestra. El servidor lo sigue hasheando igual,
 * y ese es justo el punto: para él nunca dejó de ser una cadena opaca, que es lo que
 * permitió que el contrato no cambiara. Ver ADR-008.
 */
it('hashea lo que recibe en vez de guardarlo en claro', function (): void {
    $this->postJson('/api/auth/register', registrationData())->assertCreated();

    $user = User::query()->where('email', 'ada@evault.test')->sole();

    expect($user->password)->not->toBe('contraseña-larga')
        ->and(Hash::check('contraseña-larga', $user->password))->toBeTrue();
});

it('emite un token que sirve para autenticarse', function (): void {
    $token = $this->postJson('/api/auth/register', registrationData())->json('data.token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('data.user.email', 'ada@evault.test');
});

it('rechaza un email ya registrado', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    $this->postJson('/api/auth/register', registrationData(['name' => 'Otra Ada']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});

/*
 * El correo se normaliza antes de comprobar la unicidad, así que dos altas que
 * solo difieren en mayúsculas son la misma cuenta y la segunda debe fallar.
 *
 * Desde ADR-008 esta normalización dejó de ser solo una comodidad: el correo es el
 * salt con el que el cliente deriva, así que la del servidor y la del cliente tienen
 * que coincidir o el usuario no podría entrar después.
 */
it('trata el email como insensible a mayúsculas', function (): void {
    User::factory()->create(['email' => 'ada@evault.test']);

    $this->postJson('/api/auth/register', registrationData([
        'name' => 'Otra Ada',
        'email' => 'ADA@evault.test',
    ]))->assertStatus(422);
});

it('normaliza el email que guarda', function (): void {
    $this->postJson('/api/auth/register', registrationData(['email' => '  ADA@Evault.Test  ']))
        ->assertCreated();

    $this->assertDatabaseHas('users', ['email' => 'ada@evault.test']);
});

it('exige los cinco campos', function (): void {
    $this->postJson('/api/auth/register', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'email', 'password', 'wrapped_key', 'wrapped_key_iv']);
});

/*
 * Uno a uno y no solo todos juntos: lo que hay que impedir es exactamente el alta a
 * la que le falta la clave, que es la que produciría la cuenta irreparable.
 */
it('rechaza un alta sin clave envuelta', function (string $field): void {
    $data = registrationData();
    unset($data[$field]);

    $this->postJson('/api/auth/register', $data)
        ->assertStatus(422)
        ->assertJsonValidationErrors($field);

    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('vaults', 0);
})->with(['wrapped_key', 'wrapped_key_iv']);

it('rechaza una contraseña demasiado corta', function (): void {
    $this->postJson('/api/auth/register', registrationData(['password' => 'corta']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('password');
});

it('rechaza un email con formato inválido', function (): void {
    $this->postJson('/api/auth/register', registrationData(['email' => 'esto-no-es-un-email']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('email');
});
