import type { CustodyHost } from '../platform/types'
import type { ForgetReason, Held } from './keeper'
import { CUSTODY_CHANNEL, type CustodyMessage } from './protocol'

/**
 * The custody as the popup sees it: hold, ask, touch and forget (ADR-023 §4).
 *
 * ITS INTERFACE IS KEPT THAT SMALL ON PURPOSE, and nothing here knows where the key lives.
 * That is the `host`: an offscreen document in Chrome, a persistent background page in
 * Firefox (ADR-025 §2.1), both running src/custody/host.ts on the other end of the channel.
 */

/** How long to wait for the host to answer before treating the vault as locked. */
const ANSWER_TIMEOUT_MS = 1500

export function createCustody(host: CustodyHost, channel: BroadcastChannel = new BroadcastChannel(CUSTODY_CHANNEL)) {
  const post = (message: CustodyMessage) => channel.postMessage(message)

  return {
    async hold(held: Held): Promise<void> {
      await host.ensure()
      post({ op: 'hold', held })
    },

    /**
     * What the host holds. With no host there is nothing to ask: the vault is locked, and
     * opening one just to hear that would be the popup creating state by looking at it.
     */
    async ask(): Promise<Held | null> {
      if (!(await host.exists())) return null

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

    /** A secret was copied; the host will clear the clipboard even if the popup closes. */
    copied(): void {
      post({ op: 'copied' })
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
