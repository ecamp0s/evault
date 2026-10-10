import { REOPEN_CHANNEL, askToReopen } from '../../reopenPopup'
import type { Platform } from '../types'

/**
 * Firefox's side of src/platform/types.ts (ADR-025).
 *
 * IT CALLS `browser.*` AND NOT `chrome.*`. Firefox answers to both, but `browser` is the
 * namespace whose promises it documents, and ADR-025 §4 left open whether `chrome` returns
 * them under Manifest V2. This way nothing depends on the answer.
 */

const UNLOCK_PAGE = 'popup.html'

export const firefoxPlatform: Platform = {
  async openTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    return tab
  },

  get scripting() {
    return browser.scripting
  },

  storage: {
    async get(key) {
      const { [key]: value } = await browser.storage.local.get(key)
      return value
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value })
    },
  },

  unlockIn: 'page',
  sessionClient: 'extension-firefox',

  /*
   * A SMALL WINDOW AND NOT A TAB since #769, which measured it with Windows Hello in the
   * Firefox of Windows: the passkey is asked for and answered in it, and it closes on its
   * own. It was option B of ADR-025 §2.2, set aside only because it had not been measured.
   * It carries the id of the window it came from, which is where the popup reopens.
   */
  async openUnlockPage() {
    const opener = await browser.windows.getCurrent()
    await browser.windows.create({
      url: `${UNLOCK_PAGE}?unlock&window=${opener.id ?? ''}`,
      type: 'popup',
      width: 420,
      height: 560,
    })
  },

  async reopenPopup() {
    const windowId = Number(new URLSearchParams(location.search).get('window'))
    if (!Number.isInteger(windowId) || windowId <= 0) return
    await askToReopen(windowId, new BroadcastChannel(REOPEN_CHANNEL))
  },

  async closeThisTab() {
    const tab = await browser.tabs.getCurrent()
    if (tab?.id !== undefined) await browser.tabs.remove(tab.id)
  },

  /*
   * THE BACKGROUND PAGE IS ALWAYS THERE (ADR-025 §2.1): it is persistent, it holds the key
   * and it never closes. So there is nothing to open, and whether it holds a key is its
   * answer to `ask` — which comes back empty when the vault is locked, exactly as a missing
   * document does in Chrome.
   */
  custodyHost: {
    exists: async () => true,
    ensure: async () => {},
  },
}
