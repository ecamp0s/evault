<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The passkeys that open a vault without the master password. See ADR-021.
 *
 * A TABLE AND NOT COLUMNS, which is where this parts company with ADR-010. The recovery
 * key put its wrapper in vault_members because there is exactly one per member; here
 * there is one per credential, and a person has as many credentials as ecosystems they
 * use — a synced Apple one covers iPhone, iPad and Mac, and covers no Windows browser
 * at all. That cardinality does not fit in vault_members without a column per passkey.
 *
 * ONE ROW IS ONE CREDENTIAL AND ITS WRAPPER OF ONE VAULT, and today that means one row
 * per credential because there is exactly one vault. When shared vaults arrive there
 * will be one row per credential and vault, with auth_hash repeated across them, and
 * THAT is the signal to split this in two tables — the credential's identity on one
 * side and the wrappers on the other. It is written here so that day is recognised
 * rather than discovered. ADR-021 §6 carries it as a trigger.
 *
 * The identifier is a UUIDv7 for the reason FOUNDATION.md §1 gives about everything
 * hanging off a vault: it travels in the URL when revoking, and a sequential integer
 * would leak how many passkeys exist in the system and in what order they appeared.
 *
 * NOTHING HERE IS NULLABLE, unlike the recovery key's columns, and the difference is
 * real rather than a change of criterion: «a user with no passkey» is a legitimate
 * state and it is expressed by having no ROW. A row that exists with half its columns
 * empty would be a passkey that cannot open anything, which is the silent failure
 * ADR-010 §4 already warned about for the recovery key.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('passkeys', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('vault_id')->constrained()->cascadeOnDelete();

            /*
             * The credential's own id, as the authenticator produced it, in base64.
             *
             * Unique across the whole table and not per user: the same credential
             * cannot belong to two accounts, and if one ever arrived twice it would
             * mean something went wrong upstream rather than that a second account
             * wants it.
             */
            $table->string('credential_id')->unique();

            /*
             * What the person called this passkey. Metadata in the clear, and the
             * screen has to say so instead of pretending otherwise. See ADR-021 §5.2.
             */
            $table->string('label');

            /*
             * The hostname this credential was registered under, and the only one it
             * unlocks through — a passkey is scoped to its relying party. This instance
             * answers to two names by ADR-015, so without this column the application
             * cannot tell anybody why their passkey does not appear. Decided in #578.
             */
            $table->string('rp_id');

            /*
             * Derived from the PRF with its own domain label, and stored hashed like
             * every other authentication hash: the server never keeps the value it
             * receives. See ADR-008 and ADR-010.
             *
             * NOT UNIQUE and not indexed for lookup, and that is a consequence of
             * hashing rather than an oversight: a hash cannot be searched for. Whoever
             * unlocks is found by email and then checked against each of that account's
             * passkeys, the same shape the ordinary login already has.
             */
            $table->string('auth_hash');

            // text for the same reason as wrapped_key: a format in the client decides
            // the size and the schema does not cap it.
            $table->text('wrapped_key');
            $table->string('wrapped_key_iv');

            /*
             * When it was last used to unlock. Informative, so somebody can recognise
             * which of their passkeys is which before revoking one.
             *
             * Nullable because a passkey that has never unlocked anything is the normal
             * state right after registering it.
             */
            $table->timestamp('last_used_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('passkeys');
    }
};
