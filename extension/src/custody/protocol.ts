import type { ForgetReason, Held } from './keeper'

/**
 * The messages between the popup, the service worker and the offscreen document.
 *
 * OVER BroadcastChannel, AND NEVER chrome.runtime.sendMessage, which is the whole reason
 * this protocol exists (ADR-023 §4). A BroadcastChannel clones its messages with the
 * structured clone algorithm, and a non-extractable CryptoKey survives that intact —
 * measured for ADR-023. `sendMessage` serialises to JSON, and a CryptoKey serialises to
 * `{}`: the only way to send the key through it would be to take it out raw first. The
 * ESLint config forbids `sendMessage` in the extension so nobody reaches for it.
 */

export const CUSTODY_CHANNEL = 'evault-custody'

export type CustodyMessage =
  | { op: 'hold'; held: Held }
  | { op: 'ask'; id: string }
  | { op: 'state'; id: string; held: Held | null }
  | { op: 'touch' }
  | { op: 'forget'; reason: ForgetReason }
  | { op: 'forgotten'; reason: ForgetReason }
