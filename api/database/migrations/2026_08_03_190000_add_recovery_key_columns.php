<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El material de la clave de recuperación. Ver ADR-010.
 *
 * Son dos cosas distintas y por eso van en dos tablas distintas.
 *
 * El envoltorio de recuperación va en vault_members, junto al envoltorio normal y
 * por el mismo argumento de ADR-008: describe cómo abre ESTA persona ESTA vault. Es
 * la misma clave de vault, envuelta una segunda vez con otra clave. Para el
 * servidor son bytes opacos igual que wrapped_key, y no puede abrirlos ni
 * validarlos.
 *
 * El hash de autenticación de recuperación va en users porque autentica a la
 * PERSONA, no a su relación con una vault concreta. Es el análogo exacto de
 * password, que es donde ADR-008 puso el hash de autenticación normal, y se
 * almacena igual de hasheado.
 *
 * NULABLES, al contrario que wrapped_key, y no es una relajación del criterio:
 * «usuario sin clave de recuperación» es un estado legítimo y permanente. ADR-010
 * decidió que la clave se ofrece pero se puede rechazar, y quien la rechace se
 * queda exactamente en el modelo anterior, que sigue siendo correcto. Un miembro
 * sin wrapped_key es alguien que no puede abrir su vault; un miembro sin
 * recovery_wrapped_key es alguien que eligió no tener segunda llave.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vault_members', function (Blueprint $table) {
            // text por el mismo motivo que wrapped_key: el tamaño lo decide un
            // formato del cliente y el esquema no le pone techo.
            $table->text('recovery_wrapped_key')->nullable();

            $table->string('recovery_wrapped_key_iv')->nullable();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('recovery_auth_hash')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('vault_members', function (Blueprint $table) {
            $table->dropColumn(['recovery_wrapped_key', 'recovery_wrapped_key_iv']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('recovery_auth_hash');
        });
    }
};
