<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The vault's key, wrapped with the member's master key. See ADR-008.
 *
 * To the server they are opaque bytes, exactly like an item's ciphertext: it cannot
 * open them, validate them, or deduce anything from them. The only thing that differs
 * from vault_items is what is inside, and the server does not know that.
 *
 * It goes here and not in vaults or in users because the wrapped key describes neither
 * a vault nor a person, but the relation between the two: it is the answer to «how
 * does this person open this vault». Once shared vaults exist, each member will have
 * their own wrapping of the same key, and that will be one more row here without
 * touching anything written.
 *
 * NOT NULL on purpose: a member with no wrapped key is a member who cannot open the
 * vault — that is, a state there is no sense in admitting. No default value and no data
 * migration are needed because the development data is discarded; it was never deployed
 * with real data, which is the condition #59 put on record.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vault_members', function (Blueprint $table) {
            // text and not string: it is base64 of 256 bits plus the GCM tag, so today
            // it would fit into 255 with room to spare, but the size is decided by a
            // format in the client and the schema had better not cap it.
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
