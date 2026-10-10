import { startCustodyHost } from '../../custody/host'
import { REOPEN_CHANNEL, serveReopen } from '../../reopenPopup'

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

/*
 * The other half of reopening the popup after the unlock window (#769): this page outlives
 * that window, so it is the one that waits for the person's window to take the focus back.
 * Chrome's types, which `browser` borrows, only have `openPopup` on `action`; Firefox's
 * Manifest V2 has it on `browserAction`.
 */
const browserAction = browser.browserAction as unknown as { openPopup(options: { windowId: number }): Promise<void> }

serveReopen(new BroadcastChannel(REOPEN_CHANNEL), {
  onFocusChanged(listener) {
    browser.windows.onFocusChanged.addListener(listener)
    return () => browser.windows.onFocusChanged.removeListener(listener)
  },
  openPopup: (windowId) => browserAction.openPopup({ windowId }),
})
