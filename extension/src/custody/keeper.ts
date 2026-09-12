import { INACTIVITY_LIMIT_MS } from '@/lib/vault/autoLock'

/**
 * What the extension holds while it is unlocked, and the rules for forgetting it.
 *
 * THIS IS ADR-007 MOVED INTO AN EXTENSION, not relaxed (ADR-023 §2.2): the vault key as a
 * non-extractable CryptoKey, in memory only, and the token living exactly as long as the
 * key. It runs inside the offscreen document, which is what survives the service worker
 * dying; this class knows nothing about that document, so its rules can be tested
 * without a browser.
 */

export interface Held {
  /** The vault key. Non-extractable: it can be used here and never read. */
  key: CryptoKey
  /** Revoked when the key is forgotten. */
  token: string
  vaultId: string
  email: string
  instance: string
}

/** Why the key was forgotten. The popup says it differently for each. */
export type ForgetReason = 'manual' | 'inactivity' | 'system-locked' | 'replaced'

export interface KeeperDependencies {
  /** Revokes a token. Best effort: a failure orphans it and never keeps the key. */
  revoke: (instance: string, token: string) => Promise<unknown>
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
  /** Told after the key is gone, so the document can say so to whoever listens. */
  onForgotten?: (reason: ForgetReason) => void
}

export class Keeper {
  private held: Held | null = null
  private timer: unknown = null
  private readonly deps: KeeperDependencies

  constructor(deps: KeeperDependencies) {
    this.deps = deps
  }

  /**
   * Holds a freshly unlocked key. A key already held is forgotten first, token included:
   * two live tokens for one extension would be one nobody revokes.
   */
  hold(held: Held): void {
    if (this.held) this.forget('replaced')

    this.held = held
    this.restartTimer()
  }

  /** What is held, if anything. Asking is not activity: a popup opening is not using it. */
  ask(): Held | null {
    return this.held
  }

  /**
   * Somebody used the extension, so the inactivity countdown starts again.
   *
   * IT DOES NOTHING WHEN LOCKED, and that is the point of checking: a touch arriving just
   * after the countdown fired must not start a timer for a key that is no longer there.
   */
  touch(): void {
    if (this.held) this.restartTimer()
  }

  /**
   * Forgets the key and the token, and revokes the token.
   *
   * THE KEY GOES FIRST AND SYNCHRONOUSLY; the revocation is sent afterwards and not
   * awaited. If the network is slow or absent, the vault must already be locked while
   * the request travels — the order is what makes «lock» mean locked the instant it
   * returns.
   */
  forget(reason: ForgetReason): void {
    const held = this.held
    this.held = null

    if (this.timer !== null) {
      this.deps.clearTimer(this.timer)
      this.timer = null
    }

    if (!held) return

    void Promise.resolve(this.deps.revoke(held.instance, held.token)).catch(() => {})
    this.deps.onForgotten?.(reason)
  }

  private restartTimer(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer)

    // The web's limit, imported and not copied: ADR-023 §4 decides that the lock exists
    // and that it is the same as the web's, not how long it is.
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      this.forget('inactivity')
    }, INACTIVITY_LIMIT_MS)
  }
}
