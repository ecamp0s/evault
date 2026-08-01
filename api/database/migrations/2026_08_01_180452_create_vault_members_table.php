<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pertenencia de un usuario a un vault, con su rol. Ver ADR-004.
 *
 * Se llama vault_members y no vault_user, que sería la convención de Laravel
 * para un pivot, porque no es un pivot puro: ya lleva rol, y cuando existan las
 * organizaciones llevará además estado de invitación. Las relaciones declaran el
 * nombre de la tabla de forma explícita.
 *
 * La clave primaria es el par y no un identificador propio. Aparte de ser la
 * forma habitual de una tabla de pertenencia, evita un problema real: attach()
 * inserta sin pasar por ningún modelo, así que una clave UUID se quedaría sin
 * generar y reventaría contra el NOT NULL. Con la clave compuesta, la relación
 * se puede usar de la forma idiomática sin sorpresas.
 *
 * En la Iteración 2 solo hay un rol posible. La columna existe igualmente porque
 * añadirla después obligaría a migrar filas ya escritas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vault_members', function (Blueprint $table) {
            $table->foreignUuid('vault_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // Sin valor por defecto: el rol se decide siempre en la llamada, para
            // que añadir un rol nuevo no herede en silencio el que hubiera aquí.
            $table->string('role');

            $table->timestamps();

            // Nadie pertenece dos veces al mismo vault.
            $table->primary(['vault_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vault_members');
    }
};
