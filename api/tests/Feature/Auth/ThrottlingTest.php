<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Cache;

/*
 * El contador de intentos vive en la caché, y RefreshDatabase no la toca. Sin
 * vaciarla, el primer test que agota el límite deja bloqueados a los siguientes y
 * el resultado depende del orden de ejecución.
 */
beforeEach(function (): void {
    Cache::flush();

    $this->user = User::factory()->create([
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ]);
});

/** Intenta entrar con la contraseña equivocada. */
function intentoFallido(string $email = 'ada@evault.test'): \Illuminate\Testing\TestResponse
{
    return test()->postJson('/api/auth/login', [
        'email' => $email,
        'password' => 'no-es-la-suya',
    ]);
}

it('bloquea el login al superar el número de intentos', function (): void {
    $limite = (int) config('throttling.login.intentos');

    for ($i = 0; $i < $limite; $i++) {
        intentoFallido()->assertUnauthorized();
    }

    intentoFallido()->assertStatus(429);
});

it('devuelve Retry-After en el 429', function (): void {
    $limite = (int) config('throttling.login.intentos');

    for ($i = 0; $i < $limite; $i++) {
        intentoFallido();
    }

    $respuesta = intentoFallido();

    $respuesta->assertStatus(429)->assertHeader('Retry-After');
    expect((int) $respuesta->headers->get('Retry-After'))->toBeGreaterThan(0);
});

/*
 * Lo importante del bloqueo: no se levanta al acertar la contraseña. Si el
 * atacante pudiera desbloquearse dando con ella, el límite no serviría de nada.
 */
it('sigue bloqueando aunque después se acierte la contraseña', function (): void {
    $limite = (int) config('throttling.login.intentos');

    for ($i = 0; $i < $limite; $i++) {
        intentoFallido();
    }

    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->assertStatus(429);
});

it('deja entrar con normalidad dentro del umbral', function (): void {
    intentoFallido()->assertUnauthorized();

    $this->postJson('/api/auth/login', [
        'email' => 'ada@evault.test',
        'password' => 'contraseña-larga',
    ])->assertOk();
});

/*
 * El límite cuenta peticiones al endpoint, no solo fallos, y este test lo deja
 * escrito para que no se descubra por sorpresa.
 *
 * Se valoró limpiar el contador tras un login correcto, que es lo que haría falta
 * para contar solo fallos. Se descartó: el middleware guarda el contador bajo
 * md5(nombreDelLimitador . clave), y esa transformación es un detalle interno de
 * Laravel que no forma parte de su API pública. Replicarla habría acoplado el
 * proyecto a algo que puede cambiar en cualquier versión menor, y el modo de fallo
 * sería silencioso: usuarios bloqueados de más sin que nada avisara.
 *
 * Lo que se pierde es un caso raro: quien falla cuatro veces, acierta a la quinta
 * y vuelve a intentar entrar dentro del mismo minuto. Lo que se gana es no
 * depender de un detalle no documentado. El precio de ese caso es esperar un
 * minuto.
 */
it('cuenta también los intentos correctos', function (): void {
    $limite = (int) config('throttling.login.intentos');
    $credenciales = ['email' => 'ada@evault.test', 'password' => 'contraseña-larga'];

    for ($i = 0; $i < $limite; $i++) {
        $this->postJson('/api/auth/login', $credenciales)->assertOk();
    }

    $this->postJson('/api/auth/login', $credenciales)->assertStatus(429);
});

/*
 * La clave incluye el correo, así que atacar una cuenta no puede dejar fuera a
 * otra desde la misma IP. Sin esto, en una oficina detrás de NAT bastaría con
 * atacar a un compañero para bloquear a todos.
 */
it('no comparte contador entre correos distintos desde la misma IP', function (): void {
    $limite = (int) config('throttling.login.intentos');
    User::factory()->create(['email' => 'otro@evault.test', 'password' => 'contraseña-larga']);

    for ($i = 0; $i < $limite; $i++) {
        intentoFallido('ada@evault.test');
    }

    intentoFallido('ada@evault.test')->assertStatus(429);

    $this->postJson('/api/auth/login', [
        'email' => 'otro@evault.test',
        'password' => 'contraseña-larga',
    ])->assertOk();
});

it('limita también el registro', function (): void {
    $limite = (int) config('throttling.registro.intentos');

    for ($i = 0; $i < $limite; $i++) {
        $this->postJson('/api/auth/register', datosDeRegistro([
            'name' => 'Nueva',
            'email' => "nueva{$i}@evault.test",
        ]))->assertCreated();
    }

    $this->postJson('/api/auth/register', datosDeRegistro([
        'name' => 'Una más',
        'email' => 'unamas@evault.test',
    ]))->assertStatus(429);
});

/*
 * El límite del registro va solo por IP a propósito: si incluyera el correo,
 * cambiarlo en cada petición lo esquivaría, que es justo lo que hace quien crea
 * cuentas en masa. Este test fija esa decisión.
 */
it('cuenta el registro por IP y no por correo', function (): void {
    $limite = (int) config('throttling.registro.intentos');

    for ($i = 0; $i < $limite; $i++) {
        $this->postJson('/api/auth/register', datosDeRegistro([
            'name' => 'Nueva',
            'email' => "distinta{$i}@evault.test",
        ]))->assertCreated();
    }

    $this->postJson('/api/auth/register', datosDeRegistro([
        'name' => 'Otro correo cualquiera',
        'email' => 'jamas-usado@evault.test',
    ]))->assertStatus(429);
});

it('no limita las rutas que ya exigen token', function (): void {
    $token = $this->user->createToken('api')->plainTextToken;

    // Muy por encima del umbral de login, para que quede claro que no aplica.
    for ($i = 0; $i < 20; $i++) {
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertOk();
    }
});
