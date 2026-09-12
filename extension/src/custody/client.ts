import type { ForgetReason, Held } from './keeper'
import { CUSTODY_CHANNEL, type CustodyMessage } from './protocol'

/**
 * The custody as the popup sees it: hold, ask, touch and forget (ADR-023 §4).
 *
 * THIS IS THE MODULE FIREFOX WOULD REPLACE, and its interface is kept that small on
 * purpose. Chrome's implementation is an offscreen document; Firefox has none, and #680
 * will have to answer where the key lives there. Nothing outside this file should know
 * that the answer in Chrome is a document.
 */

const DOCUMENT = 'offscreen.html'

/** How long to wait for the document to answer before treating the vault as locked. */
const ANSWER_TIMEOUT_MS = 1500

async function documentExists(): Promise<boolean> {
  return chrome.offscreen.hasDocument()
}

/**
 * Opens the document if it is not open.
 *
 * DECLARED FOR THE CLIPBOARD, which is true and is not all of it: the same document will
 * clear the clipboard with the popup closed (#672). If Chrome ever closes these documents
 * early for that reason, the extension locks — it fails towards asking again, not towards
 * leaking (ADR-023 §5.2).
 */
async function ensureDocument(): Promise<void> {
  if (await documentExists()) return

  await chrome.offscreen.createDocument({
    url: DOCUMENT,
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Guarda la vault desbloqueada y limpia el portapapeles con el popup cerrado.',
  })
}

export function createCustody(channel: BroadcastChannel = new BroadcastChannel(CUSTODY_CHANNEL)) {
  const post = (message: CustodyMessage) => channel.postMessage(message)

  return {
    async hold(held: Held): Promise<void> {
      await ensureDocument()
      post({ op: 'hold', held })
    },

    /**
     * What the document holds. With no document there is nothing to ask: the vault is
     * locked, and opening one just to hear that would be the popup creating state by
     * looking at it.
     */
    async ask(): Promise<Held | null> {
      if (!(await documentExists())) return null

      const id = crypto.randomUUID()
      const answer = new Promise<Held | null>((resolve) => {
        const timeout = setTimeout(() => {
          channel.removeEventListener('message', listen)
          resolve(null)
        }, ANSWER_TIMEOUT_MS)

        function listen({ data }: MessageEvent<CustodyMessage>) {
          if (data.op !== 'state' || data.id !== id) return
          clearTimeout(timeout)
          channel.removeEventListener('message', listen)
          resolve(data.held)
        }

        channel.addEventListener('message', listen)
      })

      post({ op: 'ask', id })
      return answer
    },

    touch(): void {
      post({ op: 'touch' })
    },

    forget(reason: ForgetReason): void {
      post({ op: 'forget', reason })
    },

    /**
     * Called when the key is forgotten by anything — inactivity, the system locking, a
     * lock from another popup — so an open popup does not keep saying «open» until the
     * next click.
     */
    onForgotten(callback: (reason: ForgetReason) => void): void {
      channel.addEventListener('message', ({ data }: MessageEvent<CustodyMessage>) => {
        if (data.op === 'forgotten') callback(data.reason)
      })
    },
  }
}
