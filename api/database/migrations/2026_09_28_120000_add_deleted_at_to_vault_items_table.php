<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The bin of ADR-018 §2.4: deleting an entry stamps this column instead of removing
 * the row, and the entry can be restored — the same row, the same id — until the purge
 * takes it thirty days later.
 *
 * It is the first column added to vault_items since the table was created, and the
 * table's own migration explains why that is a security decision and not a schema one.
 * What it tells the server is **when you stopped wanting something**: a date, of the
 * same kind as the two it already had, and nothing about the content. ADR-018 weighs it
 * and accepts it, and FOUNDATION.md §3 lists it among what the server knows.
 *
 * No index of its own, on purpose. Every query that reads it also filters by vault_id,
 * whose foreign key index already narrows it to one vault — a few hundred rows in the
 * real one. And a compound (vault_id, deleted_at) index costs more than it looks on
 * MySQL: it silently replaces the index the foreign key was using, and then down()
 * cannot drop it («needed in a foreign key constraint»), which is how it was found.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vault_items', function (Blueprint $table) {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('vault_items', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }
};
