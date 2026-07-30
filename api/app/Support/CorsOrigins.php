<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Traduce la variable de entorno CORS_ALLOWED_ORIGINS a la lista de orígenes
 * que acepta config/cors.php.
 *
 * El parseo es fail-closed a propósito: ante una configuración ausente, vacía o
 * comodín el resultado es la lista vacía, que no permite ningún origen. Nunca
 * degrada a permisivo. Ver ADR-005, sección 5, punto 3.
 *
 * Que la lista quede vacía no se queda callado: AppServiceProvider lo convierte
 * en un error explícito al atender una petición HTTP.
 */
final class CorsOrigins
{
    /**
     * @return list<string>
     */
    public static function fromEnv(mixed $raw): array
    {
        if (! is_string($raw)) {
            return [];
        }

        $origins = array_map(trim(...), explode(',', $raw));

        return array_values(array_filter(
            $origins,
            // El comodín se descarta en vez de propagarse: abrir la API a
            // cualquier origen nunca es el comportamiento buscado en un gestor
            // de secretos, ni siquiera cuando alguien lo escribe a propósito.
            static fn (string $origin): bool => $origin !== '' && $origin !== '*',
        ));
    }
}
