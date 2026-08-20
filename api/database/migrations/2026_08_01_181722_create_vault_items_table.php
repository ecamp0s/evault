<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A vault's entries. It is the most important table in the project, and what defines
 * it is what it does NOT have.
 *
 * There is no name column, no username, no URL and no notes. It is not an omission of
 * this iteration: if an entry's name or its address travelled in the clear, the server
 * would know which services each user has an account with, which is exactly the
 * metadata a password manager must not leak. Everything that means anything lives
 * inside the blob. See ADR-001 and docs/architecture/FOUNDATION.md.
 *
 * The accepted consequence: the server cannot search, sort, filter or validate the
 * content, so the client syncs the whole vault and works in memory.
 *
 * The only things the server does know about an item are how many there are in each
 * vault and when they were touched. That is inherent to the model and has no fix while
 * the rows exist; it is accepted the same way Bitwarden accepts it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vault_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('vault_id')->constrained()->cascadeOnDelete();

            /*
             * The ciphertext, exactly as the client sends it and without the server
             * touching it. It travels in base64 because JSON does not carry raw bytes,
             * and it is stored as the text that arrived: were the server to decode it
             * to store binary, it would be interpreting the payload and opening the
             * door to corrupting it on the way there and back.
             *
             * With AES-256-GCM the authentication tag is appended to the end of the
             * ciphertext, so it needs no column of its own.
             *
             * longText and not text: long notes go past text's 64 kB more easily than
             * it seems, and the real limit is applied in the request layer, where a
             * decent error can be returned.
             */
            $table->longText('ciphertext');

            // The AES-GCM nonce, in base64 too. Twelve bytes are sixteen characters,
            // but the column is not tightened: the schema can change and the version
            // exists precisely for that.
            $table->string('iv');

            /*
             * Version of the cryptographic schema this row was written under. It is not
             * the item's revision count.
             *
             * It is what allows changing algorithm or derivation parameters without
             * migrating what is already stored: the client reads the version, chooses
             * how to decrypt, and writes back with the new one when the time comes. An
             * integer and not an enum because the server must not opine on cryptography
             * it cannot run: a newer client has to be able to write a version this
             * server does not know.
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
