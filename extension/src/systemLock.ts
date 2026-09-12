import type { CustodyMessage } from './custody/protocol'

/** The three states `chrome.idle` reports, as strings: @types/chrome declares them as an enum. */
export type IdleState = 'active' | 'idle' | 'locked'

/**
 * Locks the vault when the operating system locks (ADR-023 §4).
 *
 * In the service worker and not in the offscreen document, because that document only
 * has `chrome.runtime` among the extension APIs and `chrome.idle` is not in it. A
 * listener registered at the top of the worker wakes it up when the state changes, so
 * this works with the worker long dead.
 *
 * ONLY `locked`, and not `idle`: `idle` means no input for a while, which is what the
 * inactivity limit already measures with the same number as the web. Locking on both
 * would be two clocks for one rule.
 */
export function onIdleStateChanged(
  state: IdleState,
  post: (message: CustodyMessage) => void,
): void {
  if (state === 'locked') post({ op: 'forget', reason: 'system-locked' })
}
