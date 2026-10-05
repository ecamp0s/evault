<?php

declare(strict_types=1);

namespace App\Application\Auth;

/**
 * Which client a session token was issued to, so that the list of open sessions can
 * tell the web from the extension (#711).
 *
 * The client says it itself, as one value of this closed list, and that is all the
 * server keeps. Neither the user agent nor the IP: they would be new metadata about
 * where the user is, and ADR-018 §2.4 puts the burden of proof on whoever adds a datum
 * like that. A client that says nothing — the builds from before this — gets a token
 * with the old name, and the list shows it as unidentified instead of guessing.
 *
 * It does not break what AccessTokens defends: sign-up, login and passkey still issue
 * indistinguishable tokens within one client. The extension only unlocks with a
 * passkey (ADR-023 §2.1), so for it the name does say how, but that is written in an
 * ADR and hides nothing.
 *
 * `extension` IS CHROME'S, and keeps that spelling on purpose (#753). It was the only
 * extension when #711 named it, so every token already issued under it is Chrome's, and so
 * is every Chrome build installed before this. Renaming it would turn all of them into
 * unidentified sessions overnight; adding Firefox's beside it changes nothing that exists.
 */
enum SessionClient: string
{
    case Web = 'web';
    case Extension = 'extension';
    case FirefoxExtension = 'extension-firefox';

    /** The token name for a client, or the old one when the client did not say. */
    public static function tokenName(?self $client): string
    {
        return $client->value ?? AccessTokens::NAME;
    }
}
