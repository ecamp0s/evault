import { toast } from 'sonner'
import { SECONDS_UNTIL_CLEAR, copyToClipboard } from '@/lib/clipboard'

/**
 * Copying from the vault, with the notice the user sees.
 *
 * Kept apart from lib/clipboard.ts because that one must know nothing about wording or
 * toasts: it is browser mechanics and is tested without painting anything.
 */

const CLIPBOARD_ERROR = 'No hemos podido acceder al portapapeles. Cópialo a mano desde la entrada.'

/**
 * Copies a secret and says so.
 *
 * The notice only mentions the countdown **when the clearing has actually been
 * scheduled**. In an insecure context it cannot be scheduled, and promising it anyway
 * would be worse than saying nothing: the user would believe their clipboard wipes
 * itself when it does not.
 *
 * And if the user did not know there was a countdown when there is one, discovering it
 * would mean finding that pasting does not work and not understanding why. Hence
 * saying it in one case and staying quiet in the other.
 */
export async function copySecret(text: string, what: string): Promise<void> {
  const result = await copyToClipboard(text)

  if (result === 'error') {
    toast.error(CLIPBOARD_ERROR)

    return
  }

  toast.success(
    result === 'copied-with-clear'
      ? `${what} copiada. Se borrará del portapapeles en ${SECONDS_UNTIL_CLEAR} s.`
      : `${what} copiada.`,
  )
}

/**
 * Copies something that is not a secret, such as the username. With no countdown:
 * wiping the clipboard over a username would be a nuisance that buys nothing.
 */
export async function copyValue(text: string, what: string): Promise<void> {
  const result = await copyToClipboard(text, false)

  if (result === 'error') {
    toast.error(CLIPBOARD_ERROR)

    return
  }

  toast.success(`${what} copiado.`)
}
