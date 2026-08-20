<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The recovery key's material. See ADR-010.
 *
 * They are two different things and that is why they go in two different tables.
 *
 * The recovery wrapper goes in vault_members, next to the ordinary wrapper and by the
 * same argument from ADR-008: it describes how THIS person opens THIS vault. It is the
 * same vault key, wrapped a second time with another key. To the server they are
 * opaque bytes just like wrapped_key, and it can neither open them nor validate them.
 *
 * The recovery authentication hash goes in users because it authenticates the PERSON,
 * not their relation to any one vault. It is the exact analogue of password, which is
 * where ADR-008 put the ordinary authentication hash, and it is stored hashed just the
 * same.
 *
 * NULLABLE, unlike wrapped_key, and it is not a relaxing of the criterion: «user with
 * no recovery key» is a legitimate and permanent state. ADR-010 decided the key is
 * offered but can be declined, and whoever declines stays exactly in the earlier model,
 * which is still correct. A member with no wrapped_key is somebody who cannot open
 * their vault; a member with no recovery_wrapped_key is somebody who chose not to have
 * a second key.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vault_members', function (Blueprint $table) {
            // text for the same reason as wrapped_key: the size is decided by a format
            // in the client and the schema does not cap it.
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
