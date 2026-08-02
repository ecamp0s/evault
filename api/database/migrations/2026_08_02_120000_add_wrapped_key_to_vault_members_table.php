<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La clave de la vault, envuelta con la clave maestra del miembro. Ver ADR-008.
 *
 * Para el servidor son bytes opacos, exactamente igual que el ciphertext de un
 * item: no puede abrirlos, ni validarlos, ni deducir nada de ellos. Lo único que
 * cambia respecto a vault_items es qué hay dentro, y eso el servidor no lo sabe.
 *
 * Va aquí y no en vaults ni en users porque la clave envuelta no describe a una
 * vault ni a una persona, sino la relación entre las dos: es la respuesta a «cómo
 * abre esta persona esta vault». Cuando existan las vaults compartidas, cada
 * miembro tendrá su propia envoltura de la misma clave, y eso será una fila más
 * aquí sin tocar nada de lo escrito.
 *
 * NOT NULL a propósito: un miembro sin clave envuelta es un miembro que no puede
 * abrir la vault, es decir, un estado que no tiene sentido admitir. No hace falta
 * valor por defecto ni migración de datos porque los de desarrollo se descartan;
 * nunca se desplegó con datos reales, que es la condición que registró #59.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vault_members', function (Blueprint $table) {
            // text y no string: es base64 de 256 bits más la etiqueta de GCM, así
            // que hoy cabría de sobra en 255, pero el tamaño lo decide un formato
            // del cliente y no conviene que el esquema le ponga techo.
            $table->text('wrapped_key');

            $table->string('wrapped_key_iv');
        });
    }

    public function down(): void
    {
        Schema::table('vault_members', function (Blueprint $table) {
            $table->dropColumn(['wrapped_key', 'wrapped_key_iv']);
        });
    }
};
