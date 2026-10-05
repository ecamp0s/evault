import { revokeToken } from '../api'
import { Keeper } from './keeper'
import { CUSTODY_CHANNEL, type CustodyMessage } from './protocol'
import { Sweeper, clearClipboard } from './sweeper'

/**
 * The custody host: the only place the unlocked vault key lives (ADR-023 §2.2), and the
 * one that clears the clipboard once the popup has closed (#672).
 *
 * THE SAME CODE IN EVERY BROWSER, and only the page that runs it changes. In Chrome it is
 * an offscreen document, which Manifest V3 does not stop after thirty seconds of idleness
 * the way it stops the service worker — measured for ADR-023, 150 seconds with the worker
 * dead and the key still there. In Firefox it is a persistent background page, where #748
 * ran this very code unchanged (ADR-025 §2.1). It only listens on the custody channel.
 *
 * `close` is the one thing that differs: what the page does with itself once the key is
 * gone. A Chrome document closes, so an idle extension holds no page at all; a Firefox
 * background page cannot, and #748 measured that `window.close()` there does nothing.
 */
export function startCustodyHost(close: () => void): void {
  const channel = new BroadcastChannel(CUSTODY_CHANNEL)
  const post = (message: CustodyMessage) => channel.postMessage(message)
  const timers = {
    setTimer: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimer: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  }

  const sweeper = new Sweeper({ clear: () => clearClipboard(), ...timers })

  /*
   * LOCKING CLOSES THE HOST WHERE IT CAN (ADR-023 §4), and three things decide how.
   *
   * A copied password goes first: the host is about to close, and a pending clearing
   * would die with it.
   *
   * Then the revocation: closing while the request travels would cut it, and the token
   * would stay alive. So the close waits for it to settle, success or not.
   *
   * And an unlock can arrive in between — lock and unlock again within the milliseconds a
   * revocation takes. A close already scheduled would then take the NEW key with it, so a
   * hold cancels it. The key is gone the instant `forget` returns either way; this only
   * decides whether the empty host stays.
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
        if (closing) close()
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
}
