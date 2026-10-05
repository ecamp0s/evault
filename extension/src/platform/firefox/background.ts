import { startCustodyHost } from '../../custody/host'

/**
 * Firefox's custody host: the persistent background page of Manifest V2 (ADR-025 §2.1).
 *
 * The same host Chrome runs in its offscreen document, and #748 ran it here unchanged: the
 * key crossed BroadcastChannel both ways, survived eight minutes untouched, and was
 * forgotten and its token revoked at exactly fifteen minutes.
 *
 * IT DOES NOT CLOSE ITSELF WHEN THE KEY GOES, because it cannot: #748 measured that
 * `window.close()` in a background page does nothing. Nor is there a system-lock listener,
 * because Firefox never reports the `locked` state (ADR-025 §2.3).
 */
startCustodyHost(() => {})
