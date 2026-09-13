import { revokeToken } from '../api'
import { Keeper } from './keeper'
import { CUSTODY_CHANNEL, type CustodyMessage } from './protocol'
import { Sweeper, clearClipboard } from './sweeper'

/**
 * The offscreen document: the only place the unlocked vault key lives (ADR-023 §2.2), and
 * the one that clears the clipboard once the popup has closed (#672).
 *
 * It has no window and, unlike the service worker, Manifest V3 does not stop it after
 * thirty seconds of idleness — measured for ADR-023, 150 seconds with the worker dead and
 * the key still there. It only listens on the custody channel, and it only has
 * `chrome.runtime` among the extension APIs, which is why the system-lock listener lives
 * in the service worker and reaches this document through the same channel.
 */

const channel = new BroadcastChannel(CUSTODY_CHANNEL)
const post = (message: CustodyMessage) => channel.postMessage(message)
const timers = {
  setTimer: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimer: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

const sweeper = new Sweeper({ clear: () => clearClipboard(), ...timers })

/*
 * LOCKING CLOSES THIS DOCUMENT (ADR-023 §4), and three things decide how.
 *
 * A copied password goes first: the document is about to close, and a pending clearing
 * would die with it.
 *
 * Then the revocation: closing the document while the request travels would cut it, and
 * the token would stay alive. So the close waits for it to settle, success or not.
 *
 * And an unlock can arrive in between — lock and unlock again within the milliseconds a
 * revocation takes. A close already scheduled would then take the NEW key with it, so a
 * hold cancels it. The key is gone the instant `forget` returns either way; this only
 * decides whether the empty document stays.
 */
let revocation: Promise<unknown> = Promise.resolve()
let closing = false

const keeper = new Keeper({
  revoke: (instance, token) => (revocation = revokeToken(instance, token)),
  ...timers,
  onForgotten: (reason) => {
    sweeper.flush()
    post({ op: 'forgotten', reason })
    closing = true
    void revocation.finally(() => {
      if (closing) window.close()
    })
  },
})

channel.onmessage = ({ data }: MessageEvent<CustodyMessage>) => {
  switch (data.op) {
    case 'hold':
      closing = false
      keeper.hold(data.held)
      break
    case 'ask':
      post({ op: 'state', id: data.id, held: keeper.ask() })
      break
    case 'touch':
      keeper.touch()
      break
    case 'forget':
      keeper.forget(data.reason)
      break
    case 'copied':
      // Copying is using the vault, so it also restarts the inactivity countdown.
      keeper.touch()
      sweeper.copied()
      break
  }
}
