import type { Platform } from '../types'

/**
 * Chrome's side of src/platform/types.ts: the only file where the popup's calls to
 * `chrome.*` live. See ADR-023 for why each one is what it is.
 */

const DOCUMENT = 'offscreen.html'
const UNLOCK_PAGE = 'popup.html'

export const chromePlatform: Platform = {
  async openTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab
  },

  get scripting() {
    return chrome.scripting
  },

  storage: {
    async get(key) {
      const { [key]: value } = await chrome.storage.local.get(key)
      return value
    },
    async set(key, value) {
      await chrome.storage.local.set({ [key]: value })
    },
  },

  unlockIn: 'popup',
  sessionClient: 'extension',

  async openUnlockTab() {
    await chrome.tabs.create({ url: `${UNLOCK_PAGE}?unlock` })
  },

  async closeThisTab() {
    const tab = await chrome.tabs.getCurrent()
    if (tab?.id !== undefined) await chrome.tabs.remove(tab.id)
  },

  custodyHost: {
    exists: () => chrome.offscreen.hasDocument(),

    /*
     * DECLARED FOR THE CLIPBOARD, which is true and is not all of it: the same document
     * clears the clipboard with the popup closed (#672). If Chrome ever closes these
     * documents early for that reason, the extension locks — it fails towards asking
     * again, not towards leaking (ADR-023 §5.2).
     */
    async ensure() {
      if (await chrome.offscreen.hasDocument()) return

      await chrome.offscreen.createDocument({
        url: DOCUMENT,
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: 'Guarda la vault desbloqueada y limpia el portapapeles con el popup cerrado.',
      })
    },
  },
}
