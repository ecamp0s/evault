import { SECONDS_UNTIL_CLEAR } from '@/lib/clipboard'

/**
 * Clears the clipboard after something secret was copied, from the offscreen document.
 *
 * IN THE DOCUMENT AND NOT IN THE POPUP, and that is the whole issue: the popup closes the
 * moment somebody clicks on the page to paste, and a timer in it dies with it. The web's
 * `copyToClipboard` schedules its clearing with a `setTimeout` in the tab, which works
 * there because the tab stays open (#672).
 *
 * THE SAME RULES AS THE WEB, on purpose: the web's delay, imported; one clearing in
 * flight, so copying something else restarts it; and the same accepted limitation — it
 * writes over without reading first, so something of the person's own copied within the
 * window goes too.
 */

export interface SweeperDependencies {
  /** Empties the clipboard. Returns whether the browser says it did. */
  clear: () => boolean
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
}

export class Sweeper {
  private timer: unknown = null
  private readonly deps: SweeperDependencies

  constructor(deps: SweeperDependencies) {
    this.deps = deps
  }

  /** A secret was copied: clear the clipboard after the delay, restarting any pending one. */
  copied(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer)

    this.timer = this.deps.setTimer(() => {
      this.timer = null
      this.deps.clear()
    }, SECONDS_UNTIL_CLEAR * 1000)
  }

  /**
   * Clears NOW if a clearing was pending, which is what locking does.
   *
   * Locking closes the document, and a pending clearing would die with it — leaving the
   * password in the clipboard precisely when the person said «I am done». So the vault
   * locking takes the copied password with it; with nothing pending, it touches nothing.
   */
  flush(): void {
    if (this.timer === null) return

    this.deps.clearTimer(this.timer)
    this.timer = null
    this.deps.clear()
  }
}

/**
 * Writes the clipboard from an extension page, with no user gesture and no focus.
 *
 * MEASURED IN #672, IN CHROMIUM 152, because the obvious ways fail and fail SILENTLY:
 *
 * - `navigator.clipboard.writeText('')` from the offscreen document resolves and changes
 *   nothing — the secret was still there.
 * - `navigator.clipboard.writeText` from the popup refuses when the popup does not have
 *   the focus, which is how the first run of the browser check failed to copy at all.
 * - Without the `clipboardWrite` permission, this function returns and changes nothing.
 *   The manifest test holds the permission in place for that reason.
 * - A textarea holding a space clears it, and leaves a space.
 *
 * What works everywhere the extension needs it —the popup, focused or not, and the
 * offscreen document half a minute later— is a `copy` command whose event writes the
 * text, which is this. The popup copies with it and the document clears with it: one
 * mechanism, the measured one.
 */
export function writeClipboard(text: string, doc: Document = document): boolean {
  const write = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', text)
    event.preventDefault()
  }

  doc.addEventListener('copy', write, { once: true })

  try {
    return doc.execCommand('copy')
  } finally {
    doc.removeEventListener('copy', write)
  }
}

/** Empties the clipboard: the empty string, not a space. */
export function clearClipboard(doc: Document = document): boolean {
  return writeClipboard('', doc)
}
