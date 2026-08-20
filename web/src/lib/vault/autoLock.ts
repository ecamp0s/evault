/**
 * WHEN THE VAULT LOCKS ITSELF. See ADR-007 and issue #220.
 *
 * `ADR-007` decided the key lives in memory only, and since #73 reloading empties it.
 * What did not exist was an expiry: while the tab stayed open, the key stayed there
 * indefinitely. Session tokens do expire after 12 hours since #149, so the cheap half
 * was hardened — a stolen token gets a session, not the content — and the half that
 * holds the secrets was not.
 *
 * The comment in keyInMemory.ts says that storing the key «would let in anyone
 * holding the device, without knowing the master password, which is precisely what a
 * password manager cannot allow». It does not take storing it to disk for that to
 * happen: not letting go of it is enough.
 *
 * THIS MODULE USES NO TIMERS, and that is what makes it correct: it is pure functions
 * over timestamps. The reason is in the comment on `idleStateFor`.
 */

/** How long inactivity is tolerated before locking. */
export const INACTIVITY_LIMIT_MS = 15 * 60 * 1000

/**
 * When the warning appears, one minute before locking.
 *
 * The warning exists because the failure mode of this feature is not locking late, it
 * is locking while somebody is reading something without touching the keyboard.
 */
export const WARNING_AT_MS = 14 * 60 * 1000

/**
 * How often the gap is checked.
 *
 * Short on purpose and at no noticeable cost: the check is a subtraction. What
 * decides when the vault locks is the timestamp, not this interval, so its only
 * effect is the precision of the detection — up to 15 seconds late on the 15 minutes.
 */
export const CHECK_INTERVAL_MS = 15 * 1000

export type IdleState = 'active' | 'warning' | 'expired'

/**
 * Which state the vault is in, given the time without activity.
 *
 * IT TAKES THE GAP AND DOES NOT MEASURE IT, and that is what makes this work in a
 * background tab. A fifteen-minute `setTimeout` will not do: browsers throttle the
 * timers of hidden tabs, so it would fire much later and the lock would arrive when
 * it no longer protects anything — which is the silent failure mode of this feature,
 * because in development it never shows.
 *
 * Comparing `Date.now()` against the last activity, throttling stops mattering: by
 * the time the tab comes back, the sum is already done.
 */
export function idleStateFor(idleMs: number): IdleState {
  if (idleMs >= INACTIVITY_LIMIT_MS) {
    return 'expired'
  }

  return idleMs >= WARNING_AT_MS ? 'warning' : 'active'
}

/**
 * Seconds left before locking, so the warning can say it.
 *
 * Rounded up so as not to announce «0 seconds» in the last stretch, and never below
 * zero in case the gap has already passed the limit.
 */
export function secondsUntilLock(idleMs: number): number {
  return Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - idleMs) / 1000))
}

/**
 * The events that count as activity.
 *
 * They deliberately do NOT include `mousemove`: a mouse sitting on a window produces
 * events with any wobble of the desk, and with that a desktop vault would never lock.
 * What counts is interaction, not presence.
 *
 * `keydown` is the one that prevents the worst side effect: the lock going off while
 * somebody is writing an entry and taking what they had with it.
 */
export const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'wheel'] as const
