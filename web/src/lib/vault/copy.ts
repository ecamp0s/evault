import { toast } from 'sonner'
import { SECONDS_UNTIL_CLEAR, copyToClipboard } from '@/lib/clipboard'

/**
 * Copying from the vault, with the notice the user sees.
 *
 * Kept apart from lib/clipboard.ts because that one must know nothing about wording or
 * toasts: it is browser mechanics and is tested without painting anything.
 */

const CLIPBOARD_ERROR = 'No hemos podido acceder al portapapeles. Cópialo a mano desde la entrada.'

/*
 * THE CALLER PASSES THE WHOLE SENTENCE, NOT THE NOUN, AND THAT IS A FIX RATHER THAN A
 * PREFERENCE.
 *
 * These two used to take a noun and append a fixed participle — feminine here and
 * masculine in the other — which works only for as long as every caller happens to pick
 * a word of the matching gender. Two of the five already did not: the second-factor code
 * put a feminine participle after a masculine noun and the recovery key did the reverse,
 * both live and both visible to whoever pressed the button.
 *
 * Adding a card was going to make it three, since a card number is masculine too. Any
 * scheme where the caller names a thing and this file conjugates for it has the same
 * hole; the caller is the only place that knows the gender of the word it chose, so the
 * caller writes the agreement. The sentences themselves are listed in copy.test.tsx.
 */

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
export async function copySecret(copied: string, text: string): Promise<void> {
  const result = await copyToClipboard(text)

  if (result === 'error') {
    toast.error(CLIPBOARD_ERROR)

    return
  }

  toast.success(
    result === 'copied-with-clear'
      ? `${copied}. Se borrará del portapapeles en ${SECONDS_UNTIL_CLEAR} s.`
      : `${copied}.`,
  )
}

/**
 * Copies something that is not a secret, such as the username. With no countdown:
 * wiping the clipboard over a username would be a nuisance that buys nothing.
 */
export async function copyValue(copied: string, text: string): Promise<void> {
  const result = await copyToClipboard(text, false)

  if (result === 'error') {
    toast.error(CLIPBOARD_ERROR)

    return
  }

  toast.success(`${copied}.`)
}
