<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Las entradas de una vault. Es la tabla más importante del proyecto, y lo que la
 * define es lo que NO tiene.
 *
 * No hay columna de nombre, ni de usuario, ni de URL, ni de notas. No es una
 * omisión de esta iteración: si el nombre de la entrada o su dirección viajaran
 * en claro, el servidor sabría en qué servicios tiene cuenta cada usuario, que es
 * exactamente el metadato que un gestor de contraseñas no debe filtrar. Todo lo
 * que significa algo vive dentro del blob. Ver ADR-001 y
 * docs/architecture/FOUNDATION.md.
 *
 * Consecuencia asumida: el servidor no puede buscar, ordenar, filtrar ni validar
 * el contenido, así que el cliente se sincroniza la vault entera y trabaja en
 * memoria.
 *
 * Lo único que el servidor sí sabe de un item es cuántos hay en cada vault y
 * cuándo se tocaron. Eso es inherente al modelo y no tiene arreglo mientras las
 * filas existan; se asume igual que lo asume Bitwarden.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vault_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('vault_id')->constrained()->cascadeOnDelete();

            /*
             * El texto cifrado, tal y como lo manda el cliente y sin que el
             * servidor lo toque. Viaja en base64 porque JSON no transporta bytes
             * crudos, y se guarda como el texto que llegó: si el servidor lo
             * decodificara para almacenar binario, estaría interpretando el
             * payload y abriría la puerta a corromperlo en la ida y la vuelta.
             *
             * Con AES-256-GCM la etiqueta de autenticación va concatenada al
             * final del texto cifrado, así que no necesita columna propia.
             *
             * longText y no text: unas notas largas se pasan de los 64 kB de text
             * con más facilidad de la que parece, y el límite real se aplica en la
             * capa de petición, donde se puede devolver un error decente.
             */
            $table->longText('ciphertext');

            // El nonce de AES-GCM, también en base64. Doce bytes son dieciséis
            // caracteres, pero no se aprieta la columna: el esquema puede cambiar
            // y la versión existe justamente para eso.
            $table->string('iv');

            /*
             * Versión del esquema criptográfico con que se escribió esta fila. No
             * es el número de revisiones del item.
             *
             * Es lo que permite cambiar de algoritmo o de parámetros de derivación
             * sin migrar lo ya guardado: el cliente lee la versión, elige cómo
             * descifrar y vuelve a escribir con la nueva cuando toque. Un entero y
             * no un enum porque el servidor no debe opinar sobre criptografía que
             * no puede ejecutar: un cliente más nuevo tiene que poder escribir una
             * versión que este servidor no conoce.
             */
            $table->unsignedSmallInteger('version');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vault_items');
    }
};
