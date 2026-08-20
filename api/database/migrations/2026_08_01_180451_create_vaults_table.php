<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The product's tenant. See ADR-004.
 *
 * The identifiers are UUIDs and not autoincrementing integers. The reason is not one
 * of style: a sequential integer in the items table that will hang off this one would
 * leak the system's total volume and the order of creation, which is the same class of
 * metadata the zero-knowledge model works to keep from revealing. And these
 * identifiers travel in the URL, so they end up in the proxy's logs.
 *
 * users stays on an integer. Both types coexist on purpose: changing the key of a
 * table that already has tokens hanging off it would gain nothing here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vaults', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');

            /*
             * Being somebody's personal vault is a relation, not a flag. Writing it
             * this way lets the unique index guarantee in the database that nobody has
             * two personal vaults; with a boolean that invariant would rest solely with
             * the service, and invariants that live only in code end up broken.
             *
             * It is nullable because shared vaults are nobody's personal one. A unique
             * index admits several NULLs, so it does not get in the way when they
             * arrive.
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
