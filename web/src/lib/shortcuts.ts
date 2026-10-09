/**
 * The keyboard shortcuts of the vault, in one place (#788, #789): each screen listening on
 * its own would end with two of them answering the same keys.
 */

/** What the user menu shows next to «Bloquear». «Mayús» is what a Spanish keyboard says. */
export const LOCK_SHORTCUT_LABEL = 'Ctrl+Mayús+L'

/**
 * Ctrl+Shift+L, or Cmd+Shift+L on a Mac, to lock (#788).
 *
 * BY `code` AND NOT BY `key`: with Shift held `key` is «L», and on another layout it is
 * whatever letter sits there, while `code` names the physical key. It answers wherever the
 * focus is, a text field included, because Ctrl+Shift+L types nothing.
 *
 * WHETHER THE BROWSER LETS IT THROUGH is checked by hand in Chrome and Firefox on Windows,
 * which is where eVault is used (#788): a browser that keeps a combination for itself
 * never hands it to the page, and the shortcut would fail in silence. A synthetic event
 * from a test or from CDP does not go through the browser's own shortcuts, so neither of
 * them can tell.
 */
export function isLockShortcut(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat'>): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && !event.repeat && event.code === 'KeyL'
}

/**
 * `/` to search (#789), as GitHub and Gmail have it.
 *
 * BY `key` AND NOT BY `code`, the other way round from locking: what matters here is the
 * character, and on a Spanish keyboard `/` is Shift+7 — so Shift is allowed, and Ctrl, Cmd
 * and Alt are not, because with them it is somebody else's shortcut.
 */
export function isSearchShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat'>): boolean {
  return event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat
}

/**
 * Whether a key pressed here is somebody typing. `/` is a character: in a URL, a note or a
 * password it has to be written, not turned into a jump to the search box.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** The attribute the screen's search box carries, so the shortcut can find it. */
export const SEARCH_BOX_ATTRIBUTE = 'data-search-box'
