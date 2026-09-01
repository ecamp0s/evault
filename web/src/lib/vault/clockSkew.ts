import { create } from 'zustand'

/**
 * How far this device's clock is from the server's, and why that matters at all.
 *
 * A TOTP code is worked out from the seed and THE CLOCK. Nothing else takes part: there
 * is no server to ask and no handshake to correct anything. So a device whose clock has
 * drifted produces codes that are perfectly correct for an instant that is not now, and
 * every service rejects them.
 *
 * ADR-017 §5.4 assumed this consequence and asked for one thing: that the implementation
 * be able to TELL THE TWO APART. Without it the symptom is «eVault gives me codes that
 * do not work», which is indistinguishable from eVault being broken and sends nobody to
 * look at the clock — which is where the problem actually is.
 *
 * It is not a far-fetched case and does not need anything to fail: a laptop that was
 * suspended, a phone with the time set by hand, or kastor itself, whose clock is not
 * monotonic between boots (#240).
 */

/**
 * The skew beyond which the codes stop being trustworthy: ONE FULL STEP.
 *
 * NOT CHOSEN BY EYE, and the unit is what decides it. A step is 30 seconds, and services
 * almost always accept the previous one and the next as well — so a device off by less
 * than a step still lands inside that tolerance and its codes work. Past one step, being
 * accepted stops depending on the clock and starts depending on somebody else's leniency,
 * which is exactly when it is worth saying something.
 *
 * Warning any earlier would be the other way of failing: a notice that fires when
 * nothing is wrong gets ignored, and with it the ones that mean something — the lesson
 * of #62 applied to a warning instead of a check.
 */
export const MAX_SKEW_MS = 30_000

interface ClockSkewState {
  /**
   * Milliseconds this device is ahead of the server. Negative means behind.
   *
   * `null` until a response has been read, which is most of the first moments of the
   * application: not knowing is not the same as being in agreement, and nothing warns
   * about a skew nobody has measured yet.
   */
  skewMs: number | null
  note: (skewMs: number) => void
}

/*
 * THERE IS NO `forget()`, and it is not an oversight: the skew is not vault content. It
 * says how far this device's clock is from the server's, which is true whether anybody
 * is logged in or not and stays true across a lock. Clearing it on logout would throw
 * away a measurement that costs a round trip to take again and reveals nothing.
 */
export const useClockSkew = create<ClockSkewState>((set) => ({
  skewMs: null,
  note: (skewMs) => set({ skewMs }),
}))

/**
 * Reads the skew from a response's `Date` header.
 *
 * THE HEADER AND NOT AN ENDPOINT, because it is already there: every response carries
 * it, so this costs no request, no round trip and no change to any contract. And it
 * tells the server nothing — it is a header being read off a response that was coming
 * anyway, not a question about TOTP.
 *
 * THE LATENCY IS IGNORED ON PURPOSE. The header is written when the server begins its
 * reply, so by the time it is read here some milliseconds have gone by and the measured
 * skew is slightly high. Against a threshold of thirty seconds that is noise; correcting
 * it would mean measuring the round trip and halving it, which is more machinery than
 * the number deserves.
 *
 * Returns `null` when there is no readable header, which is a real case: an error with
 * no response at all, or a proxy that strips it.
 */
export function skewFromHeader(header: unknown, now: number): number | null {
  if (typeof header !== 'string') return null

  const serverTime = Date.parse(header)

  if (Number.isNaN(serverTime)) return null

  return now - serverTime
}

/** Whether the skew is big enough that the codes will start being rejected. */
export function skewIsTooBig(skewMs: number | null): boolean {
  return skewMs !== null && Math.abs(skewMs) >= MAX_SKEW_MS
}

/**
 * How the skew is put into words, in seconds and saying which way it goes.
 *
 * IT NAMES THE CAUSE, which is the whole point of ADR-017 §5.4: whoever reads this has
 * to end up looking at the clock of their device and not at eVault. «Va adelantado» and
 * «va atrasado» are what a person can act on; a number of milliseconds is not.
 */
export function skewInWords(skewMs: number): string {
  const seconds = Math.round(Math.abs(skewMs) / 1000)
  const direction = skewMs > 0 ? 'adelantado' : 'atrasado'

  return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'} ${direction}`
}
