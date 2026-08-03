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
}
