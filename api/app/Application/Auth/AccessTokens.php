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
}
