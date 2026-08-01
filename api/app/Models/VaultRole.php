<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Rol de un usuario dentro de un vault.
 *
 * En la Iteración 2 solo existe Owner, porque solo existen vaults personales. Es
 * un enum y no una cadena suelta para que el conjunto de valores esté cerrado
 * desde el principio: cuando lleguen las vaults compartidas, añadir un rol será
 * añadir un caso aquí, y el análisis estático señalará cada sitio que deje de
 * cubrir todas las posibilidades.
 */
enum VaultRole: string
{
    case Owner = 'owner';
}
