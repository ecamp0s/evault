<?php

declare(strict_types=1);

namespace App\Application\Auth;

/**
 * Constantes compartidas por los servicios que emiten tokens.
 */
final class AccessTokens
{
    /**
     * Registro y login emiten tokens indistinguibles a propósito: si el nombre
     * difiriera, revelaría por qué vía se obtuvo cada uno.
     */
    public const string NAME = 'api';

    /**
     * Nombre del token que emite la recuperación.
     *
     * Aquí sí difiere del normal, al revés que entre registro y login, y por un
     * motivo distinto: no hay nada que ocultar —quien lo recibe acaba de demostrar
     * que tiene la clave de recuperación— y sí conviene poder distinguirlos al
     * revisar los tokens vivos de una cuenta.
     */
    public const string RECOVERY_NAME = 'recovery';

    /**
     * La única capacidad del token de recuperación: terminar la operación fijando
     * una contraseña maestra nueva.
     *
     * Quien llega con este token todavía no ha demostrado saber ninguna contraseña,
     * así que no puede leer items, ni listar vaults, ni borrar nada. Las rutas
     * normales exigen `*` y este token no lo tiene. Ver ADR-010.
     */
    public const string RECOVERY_ABILITY = 'recovery:complete';

    /**
     * Cuánto vive el token de recuperación.
     *
     * Corto porque su portador no ha demostrado saber la contraseña maestra, y
     * porque el flujo que lo usa es continuo: se recibe y se gasta en la misma
     * sesión de trabajo. No es una sesión que haya que mantener abierta.
     */
    public const int RECOVERY_MINUTES = 15;

    /**
     * Cuánto vive un token de sesión normal.
     *
     * El plazo sale de `ADR-007`, no de una cifra redonda: el token vive solo en
     * memoria y muere al recargar la página, así que su vida ÚTIL es el rato que
     * la pestaña siga abierta. Doce horas cubren de sobra una jornada de trabajo,
     * y a partir de ahí volver a pedir la contraseña maestra es lo correcto y no
     * una molestia: la vault que sigue abierta al día siguiente sin haberla tocado
     * es justamente la que conviene cerrar.
     *
     * Antes no caducaban, y eso tenía dos costes que el issue #149 enumeró: la
     * tabla crecía sin techo —cada recarga deja un token que ya nadie usará— y un
     * token robado de un log o de una copia de la base de datos valía para siempre.
     * La caducidad no arregla el robo, pero le pone fecha.
     */
    public const int SESSION_HOURS = 12;
}
