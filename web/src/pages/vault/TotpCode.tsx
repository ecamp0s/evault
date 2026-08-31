import { useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copySecret } from '@/lib/vault/copy'
import { parseTotp, secondsRemaining, totpCode, type TotpParameters } from '@/lib/vault/totp'

interface TotpCodeProps {
  /** The seed as it is stored: an `otpauth://` URI or a bare base32 key. */
  seed: string
}

/**
 * The six digits of the second factor, with the seconds they have left.
 *
 * THE COUNTER IS NOT ACTIVITY, and that is the one thing this component has to get
 * right. ADR-017 §2.4 wrote it as the concrete case the implementation must solve: a
 * counter refreshing every second is not the user being there, and if it were, having an
 * entry with a second factor open —which is the normal state of somebody using one—
 * would keep the vault unlocked forever.
 *
 * It holds by construction rather than by care: `autoLock` only records `keydown`,
 * `pointerdown` and `wheel` on the window, and this ticks with a `setInterval` that
 * calls `setState` and touches nothing else. The guarantee is not left to that
 * reasoning, though — there is a test that locks the vault with this on screen, and a
 * case in `verify-auto-lock.mjs` with a real clock, because jsdom cannot see the tab
 * being throttled.
 *
 * IT READS THE CLOCK EVERY TICK INSTEAD OF COUNTING DOWN, which is the same decision
 * `autoLock.ts` takes and for the same reason: browsers throttle the timers of hidden
 * tabs, so a counter that subtracts one per tick drifts behind and would show a code as
 * valid long after it expired. Recomputing from `Date.now()` makes throttling stop
 * mattering — coming back to the tab, the sum is already done.
 */
export function TotpCode({ seed }: TotpCodeProps) {
  const [now, setNow] = useState(() => Date.now())
  const [code, setCode] = useState<{ window: number; digits: string } | null>(null)

  const parameters = useMemo(() => readSeed(seed), [seed])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(tick)
  }, [])

  /*
   * The window and not the second: the code only changes when the counter does, so
   * recomputing it every tick would be an HMAC a second to produce the same digits.
   */
  const window = parameters ? Math.floor(now / 1000 / parameters.period) : null

  useEffect(() => {
    if (!parameters || window === null) return

    let cancelled = false

    void (async () => {
      try {
        const digits = await totpCode(parameters, window * parameters.period * 1000)

        if (!cancelled) setCode({ window, digits })
      } catch {
        // A seed that cannot be read is reported where it is typed, not here.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [parameters, window])

  if (!parameters) return null

  /*
   * Shown only while the digits belong to the window on screen. Generating is
   * asynchronous, so without this the code of the previous window survives into the
   * next one for a moment — six digits that look right and no longer work, which is the
   * failure this is here to avoid.
   */
  const digits = code?.window === window ? code.digits : null
  const left = secondsRemaining(parameters, now)

  return (
    <div className="flex items-center gap-3">
      <output
        aria-label="Código del segundo factor"
        className="font-mono text-2xl tracking-widest tabular-nums"
      >
        {digits ?? '······'}
      </output>

      <span
        className="text-sm text-muted-foreground tabular-nums"
        aria-label={`Caduca en ${left} segundos`}
      >
        {left} s
      </span>

      {/*
        * `copySecret` clears the clipboard after 30 seconds. That it matches the life of
        * a code is a happy coincidence and NOT a design: they are two different clocks
        * and the second does not guarantee the first, as ADR-017 §2.4 warns.
        */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Copiar el código"
        disabled={!digits}
        onClick={() => void copySecret(digits ?? '', 'Código')}
      >
        <Copy className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

/** The seed's parameters, or nothing when it cannot be read. */
function readSeed(seed: string): TotpParameters | null {
  const clean = seed.trim()

  if (!clean) return null

  try {
    return parseTotp(clean)
  } catch {
    return null
  }
}
