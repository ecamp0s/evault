<?php

declare(strict_types=1);

namespace App\Application\Auth;

/**
 * Constants shared by the services that issue tokens.
 */
final class AccessTokens
{
    /**
     * Registration and login issue indistinguishable tokens on purpose: were the name
     * to differ, it would reveal which way each one was obtained.
     */
    public const string NAME = 'api';

    /**
     * Name of the token the recovery issues.
     *
     * Here it does differ from the ordinary one, unlike between registration and login,
     * and for a different reason: there is nothing to hide — whoever receives it has
     * just proven they hold the recovery key — and it does help to tell them apart when
     * reviewing the live tokens of an account.
     */
    public const string RECOVERY_NAME = 'recovery';

    /**
     * The recovery token's only ability: finishing the operation by setting a new
     * master password.
     *
     * Whoever arrives with this token has not yet proven they know any password, so
     * they cannot read items, list vaults or delete anything. The ordinary routes
     * demand `*` and this token does not carry it. See ADR-010.
     */
    public const string RECOVERY_ABILITY = 'recovery:complete';

    /**
     * How long the recovery token lives.
     *
     * Short because its bearer has not proven they know the master password, and
     * because the flow that uses it is continuous: it is received and spent in the same
     * sitting. It is not a session anybody has to keep open.
     */
    public const int RECOVERY_MINUTES = 15;

    /**
     * How long an ordinary session token lives.
     *
     * The span comes from `ADR-007`, not from a round number: the token lives in memory
     * only and dies on reloading the page, so its USEFUL life is however long the tab
     * stays open. Twelve hours cover a working day with room to spare, and past that,
     * asking for the master password again is the right thing and not a nuisance: the
     * vault still open the next day untouched is exactly the one worth closing.
     *
     * They used not to expire, and that carried two costs issue #149 listed: the table
     * grew without a ceiling — every reload leaves a token nobody will use again — and
     * a token stolen from a log or from a database copy was good forever. Expiry does
     * not fix the theft, but it puts a date on it.
     */
    public const int SESSION_HOURS = 12;
}
