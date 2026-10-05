/**
 * What the extension needs from a browser, and nothing else (ADR-025 §2.8).
 *
 * EVERY CALL TO A BROWSER'S EXTENSION API LIVES BEHIND THIS, in src/platform/<browser>/,
 * and platformBoundary.test.ts fails if one appears anywhere else. It is what makes Firefox
 * a second implementation of these few methods and not a copy of the extension: the popup,
 * the custody, the fill and the unlock are the same code in every browser.
 */

/** The tab the popup was opened over. `url` is there only when `activeTab` granted it. */
export interface OpenTab {
  id?: number
  url?: string
}

/**
 * Where the key lives while the vault is unlocked, seen from the popup.
 *
 * In Chrome an offscreen document that has to be opened (ADR-023 §2.2); in Firefox a
 * persistent background page that is always there (ADR-025 §2.1). The popup only needs to
 * know whether it exists and to make sure it does.
 */
export interface CustodyHost {
  /** Whether anything is there to ask. Nothing there means locked. */
  exists(): Promise<boolean>
  /** Makes sure it is there before handing it a key. */
  ensure(): Promise<void>
}

export interface Platform {
  /** The active tab of the current window, or undefined when there is none. */
  openTab(): Promise<OpenTab | undefined>
  /** What injects the fill into a tab: the browser's `scripting.executeScript`. */
  scripting: Pick<typeof chrome.scripting, 'executeScript'>
  /** The extension's own storage, for what is not a secret: the remembered email. */
  storage: {
    get(key: string): Promise<unknown>
    set(key: string, value: string): Promise<void>
  }
  custodyHost: CustodyHost
}
