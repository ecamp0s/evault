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
