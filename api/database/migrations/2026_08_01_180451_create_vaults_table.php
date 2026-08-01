<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El tenant del producto. Ver ADR-004.
 *
 * Los identificadores son UUID y no enteros autoincrementales. El motivo no es
 * de estilo: un entero secuencial en la tabla de items que colgará de esta
 * filtraría el volumen total del sistema y el orden de creación, que es la misma
 * clase de metadato que el modelo zero-knowledge se esfuerza en no revelar. Y
 * estos identificadores viajan en la URL, así que acaban en los logs del proxy.
 *
 * users se queda en entero. Conviven los dos tipos a propósito: cambiar la clave
 * de una tabla que ya tiene tokens colgando no aportaría nada aquí.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vaults', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');

            /*
             * Ser el vault personal de alguien es una relación, no una marca.
             * Escribirlo así permite que el índice único garantice en la base de
             * datos que nadie tiene dos vaults personales; con un booleano esa
             * invariante quedaría solo en manos del servicio, y las invariantes
             * que únicamente viven en el código se acaban rompiendo.
             *
             * Es nullable porque las vaults compartidas del plan Team no son
             * personales de nadie. Un índice único admite varios NULL, así que no
             * estorba cuando lleguen.
             */
            $table->foreignId('personal_for_user_id')
                ->nullable()
                ->unique()
                ->constrained('users')
                ->cascadeOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vaults');
    }
};
