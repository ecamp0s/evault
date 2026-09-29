/**
 * Which session this TAB had before a reload, so signing in again replaces it (#725).
 *
 * WHY IT EXISTS. Reloading locks the vault (ADR-007) and unlocking signs in again, which
 * issues a new token; the old one stayed alive on the server for its twelve hours with
 * nobody to use it, and the list of open sessions filled up with the owner's own reloads.
 * Handing the previous token's id to the sign-in lets the server revoke it.
 *
 * THE ID AND NOT THE TOKEN, and that is what keeps this inside ADR-007. The token is the
 * secret, and it is still kept in memory and nowhere else. Its id is the number before the
 * `|` of a Sanctum token: it opens nothing, and the server only acts on it for the account
 * that has just proved its master password or passkey.
 *
 * `sessionStorage` AND NOT `localStorage`, on purpose: it survives a reload and belongs to
 * one tab. A second tab open at the same time is a legitimate session of its own, and
 * with `localStorage` signing in there would close the first.
 *
 * Every access is guarded: a browser that refuses storage just keeps the old behaviour.
 */
const KEY = 'evault.tabSessionTokenId'

/** Keeps the id of the token this tab has just been given. */
export function rememberTabSession(token: string): void {
  const id = Number(token.split('|')[0])

  try {
    if (Number.isInteger(id) && id > 0) sessionStorage.setItem(KEY, String(id))
  } catch {
    // Storage refused: signing in again will simply not replace anything.
  }
}

/** Forgets it, when the tab signs out for real. */
export function forgetTabSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing kept, nothing to forget.
  }
}

/** What a sign-in from this tab adds to its request: `{ replaces }`, or nothing. */
export function replacingTabSession(): { replaces?: number } {
  try {
    const id = Number(sessionStorage.getItem(KEY))
    return Number.isInteger(id) && id > 0 ? { replaces: id } : {}
  } catch {
    return {}
  }
}
