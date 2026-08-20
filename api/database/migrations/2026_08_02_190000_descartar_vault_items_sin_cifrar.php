<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Discards the version 1 vault items, which were never encrypted.
 *
 * A migration that deletes user data calls for an explanation, so here it is.
 *
 * Version 1 was not encryption but base64 over plaintext JSON, and it was Iteration
 * 2's deliberate exception. Those rows cannot be migrated to version 2: re-encrypting
 * them would take the vault key, which exists only on the user's device and which the
 * server has no access to and never will. Neither can they be left, because the new
 * client shows them as unreadable forever, with nothing to clean them up and nothing
 * saying why.
 *
 * Deleting them is legitimate because of the condition that accompanied that exception
 * from the first day and was respected: **it was never deployed with real user data**.
 * It is on record in issue #59 and in docs/architecture/FOUNDATION.md. What is deleted
 * here is development and test data.
 *
 * Scoped to version = 1 and not a truncate: if anybody had version 2 items, which are
 * real encryption, this migration does not touch them.
 *
 * No down(): a deletion cannot be undone, and pretending otherwise with an empty
 * method would be worse than declaring it. Reverting this migration does not bring the
 * rows back.
 *
 * THE FILE NAME STAYS IN SPANISH, and it is not something the conversion to English
 * missed. Laravel stores the whole string as a value in the `migrations` table and
 * uses it to know what has been applied: renaming a migration that has already run
 * makes it believe there is a new one pending and that the applied one has vanished.
 * On a clean database nothing happens; on a deployed instance it does. Decided in
 * #160: the applied ones are never renamed, the new ones are written in English.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('vault_items')->where('version', 1)->delete();
    }

    public function down(): void
    {
        // Deliberately does nothing. See the comment above.
    }
};
