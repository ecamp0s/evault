<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A user's membership of a vault, with their role. See ADR-004.
 *
 * It is called vault_members and not vault_user, which would be Laravel's convention
 * for a pivot, because it is not a pure pivot: it already carries a role, and once
 * organisations exist it will carry invitation state too. The relations declare the
 * table name explicitly.
 *
 * The primary key is the pair and not an identifier of its own. Beyond being the usual
 * shape of a membership table, it avoids a real problem: attach() inserts without
 * going through any model, so a UUID key would go ungenerated and blow up against the
 * NOT NULL. With the composite key, the relation can be used idiomatically without
 * surprises.
 *
 * In Iteration 2 there is only one possible role. The column exists all the same
 * because adding it later would force migrating rows already written.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vault_members', function (Blueprint $table) {
            $table->foreignUuid('vault_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // No default value: the role is always decided at the call, so that adding
            // a new role does not silently inherit whichever was here.
            $table->string('role');

            $table->timestamps();

            // Nobody belongs to the same vault twice.
            $table->primary(['vault_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vault_members');
    }
};
