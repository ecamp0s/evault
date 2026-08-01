<?php

declare(strict_types=1);

namespace App\Application\Vaults;

use App\Models\VaultRole;

/**
 * Un vault visto desde fuera: lo justo para que el cliente pueda elegir sobre cuál
 * opera.
 *
 * Es un DTO y no el modelo porque lo que sale de aquí es una lectura, no una
 * entidad: el rol no vive en la tabla de vaults sino en la de pertenencia, y
 * dejarlo colgando de un modelo obligaría a que el consumidor supiera de pivots
 * para leerlo.
 *
 * No lleva número de items a propósito, y no por ahorrar una consulta: contarlos
 * sería un dato que el servidor sí puede calcular y que el cliente no necesita del
 * servidor, porque ya se descarga la vault entera.
 */
final readonly class VaultSummary
{
    public function __construct(
        public string $id,
        public string $name,
        public bool $isPersonal,
        public VaultRole $role,
    ) {}
}
