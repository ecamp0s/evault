<?php

declare(strict_types=1);

namespace App\Application\Auth;

use Illuminate\Http\Request;

/**
 * Claves con las que se cuentan los intentos de autenticación.
 *
 * Existe como clase compartida porque la clave se usa en dos sitios que tienen
 * que coincidir exactamente: el limitador que la incrementa, y el login correcto
 * que la borra. Si divergieran, un acierto no limpiaría el contador del fallo y
 * el usuario acabaría bloqueado pese a haber entrado bien.
 */
final class AttemptKey
{
    /**
     * Login: IP más correo.
     *
     * Por IP sola, un NAT compartido dejaría fuera a usuarios legítimos cuando
     * atacan a cualquiera de ellos. Por correo solo, cualquiera podría bloquear
     * la cuenta de otro a voluntad. La combinación evita las dos cosas.
     */
    public static function login(Request $request): string
    {
        // string() y no un cast sobre input(): devuelve un Stringable tipado, y
        // convierte sin sorpresas cuando el cliente manda algo que no es texto.
        $email = mb_strtolower($request->string('email')->trim()->toString());

        return 'auth.login|'.$request->ip().'|'.$email;
    }

    /**
     * Registro: solo IP.
     *
     * Incluir el correo sería inútil: quien crea cuentas en masa usa uno distinto
     * cada vez y nunca tocaría el límite.
     */
    public static function register(Request $request): string
    {
        return 'auth.register|'.$request->ip();
    }

    /**
     * Recuperación: IP más correo, por el mismo equilibrio que el login.
     *
     * El nombre está en inglés y los dos de arriba no, siguiendo la convención de
     * CLAUDE.md: lo nuevo en inglés, y lo anterior se migra en el issue #119 sin
     * renombrar de paso al tocar el fichero.
     */
    public static function recovery(Request $request): string
    {
        $email = mb_strtolower($request->string('email')->trim()->toString());

        return 'auth.recovery|'.$request->ip().'|'.$email;
    }
}
