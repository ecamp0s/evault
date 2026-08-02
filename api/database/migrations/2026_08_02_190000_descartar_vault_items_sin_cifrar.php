<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Descarta los vault items de la versión 1, que nunca estuvieron cifrados.
 *
 * Una migración que borra datos de usuario pide una explicación, así que aquí está.
 *
 * La versión 1 no era cifrado sino base64 sobre JSON en claro, y fue la excepción
 * deliberada de la Iteración 2. Esas filas no se pueden migrar a la versión 2: para
 * recifrarlas haría falta la clave de la vault, que solo existe en el dispositivo
 * del usuario y a la que el servidor no tiene ni tendrá acceso. Tampoco se pueden
 * dejar, porque el cliente nuevo las muestra como ilegibles para siempre, sin nada
 * que las limpie y sin decir por qué.
 *
 * Borrarlas es legítimo por la condición que acompañó a esa excepción desde el
 * primer día y que se respetó: **nunca se desplegó con datos reales de usuarios**.
 * Está registrada en el issue #59 y en docs/architecture/FOUNDATION.md. Lo que se
 * borra aquí son datos de desarrollo y de pruebas.
 *
 * Acotada a version = 1 y no un truncate: si alguien tuviera items de la versión 2,
 * que sí son cifrado real, esta migración no los toca.
 *
 * Sin down(): no se puede deshacer un borrado, y fingir que sí con un método vacío
 * sería peor que declararlo. Revertir esta migración no devuelve las filas.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('vault_items')->where('version', 1)->delete();
    }

    public function down(): void
    {
        // A propósito, no hace nada. Ver el comentario de arriba.
    }
};
