/**
 * Copying to the clipboard, with automatic clearing.
 *
 * Copying is the most frequent operation of a password manager, far above creating or
 * editing, and it is also the one with the most risk surface: what is copied stays
 * there indefinitely and any application on the system can read it. That is why a
 * clearing is scheduled.
 *
 * **Two paths, and the modern one is not always there.** navigator.clipboard requires a
 * secure context, so over http and on a domain that is neither localhost nor ends in
 * .localhost the API simply does not exist: isSecureContext is false and
 * navigator.clipboard is undefined. The fallback with execCommand is not an ornament
 * for old browsers, it is what runs in any deployment over http without a certificate.
 *
 * For two iterations that was the case of this project's local environment and the
 * fallback was used daily. It stopped being so in issue #112, when the environment moved
 * to .localhost, which does give a secure context. The decision is made by looking at
 * isSecureContext at runtime and NEVER at the environment, and that is why the clearing
 * came back on its own the day there was a secure context, without touching this file.
 *
 * **And the fallback cannot clear.** execCommand only works inside a user gesture:
 * during the click yes, but in the thirty-second timer afterwards there is no gesture
 * left and the browser ignores it. Checked in a browser, the password was still in the
 * clipboard past the deadline. Hence the result of copying telling whether the clearing
 * was scheduled: whoever notifies the user must not promise a cleanup that is not going
 * to happen.
 *
 * `copied-without-clear` is still a real case even though the local environment no
 * longer produces it: it happens to whoever deploys over http on their network without
 * a certificate, and also to whoever denies the clipboard permission while having a
 * secure context.
 */

/**
 * Seconds before the clipboard is cleared.
 *
 * Thirty is how long a person takes to paste the password where it was going, with room
 * to hit the wrong tab once. Lowering it much turns the measure into a nuisance, and
 * raising it leaves it decorative.
 */
export const SECONDS_UNTIL_CLEAR = 30

/**
 * `copied-without-clear` is not a rare case: it is what happens in any deployment
 * without a secure context, and also when the user denies the permission and the
 * fallback has to be used.
 */
export type CopyResult = 'copied-with-clear' | 'copied-without-clear' | 'error'

/** Which way the copy was achieved, or null when it was not. */
type Via = 'modern' | 'fallback' | null

let pendingClear: ReturnType<typeof setTimeout> | null = null

/**
 * The fallback for insecure contexts.
 *
 * execCommand is marked as obsolete, but it is the only thing that works without https.
 * The textarea sits out of view and is removed as soon as it finishes; even so, for that
 * instant the password exists in the DOM, which is a real difference from the modern
 * path and worth keeping in mind.
 */
function copyWithHiddenTextarea(text: string): boolean {
  const field = document.createElement('textarea')

  field.value = text
  field.setAttribute('readonly', '')
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.top = '-9999px'
  field.style.opacity = '0'

  document.body.appendChild(field)

  try {
    field.select()

    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

async function write(text: string): Promise<Via> {
  if (window.isSecureContext && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)

      return 'modern'
    } catch {
      // The user may have denied the permission. The fallback is tried before giving up.
    }
  }

  return copyWithHiddenTextarea(text) ? 'fallback' : null
}

/**
 * Copies a text and, when it can, schedules the clearing of the clipboard.
 *
 * The clearing is only scheduled when the copy went through the modern path, because
 * that is the only one that will still be available thirty seconds later. If the
 * fallback was needed, scheduling it would leave a timer that does nothing and give the
 * false impression that the measure is active.
 *
 * An accepted limitation of the path that does work, and one not to oversell: the
 * clearing writes over without checking what is there first. Checking would take reading
 * the clipboard, which asks the user for an explicit permission and would be a worse
 * remedy than the disease. In practice it means that, if the user copies something else
 * of their own within the time window, the clearing takes it down.
 *
 * @param vaciarDespues false for what is not a secret, such as the username
 */
export async function copyToClipboard(text: string, clearAfterwards = true): Promise<CopyResult> {
  const via = await write(text)

  if (via === null) {
    return 'error'
  }

  // There is only ever one clearing in flight: copying something else restarts the
  // countdown instead of piling up timers that would fire at the wrong moment.
  cancelClear()

  if (!clearAfterwards || via !== 'modern') {
    return 'copied-without-clear'
  }

  pendingClear = setTimeout(() => {
    pendingClear = null
    void write('')
  }, SECONDS_UNTIL_CLEAR * 1000)

  return 'copied-with-clear'
}

export function cancelClear(): void {
  if (pendingClear !== null) {
    clearTimeout(pendingClear)
    pendingClear = null
  }
}
