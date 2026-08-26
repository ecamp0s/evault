import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { hasUnsavedRecoveryKey, hasUnsavedWork } from '@/lib/vault/unsavedWork'
import {
  ACTIVITY_EVENTS,
  CHECK_INTERVAL_MS,
  idleStateFor,
  secondsUntilLock,
} from '@/lib/vault/autoLock'

const WARNING_ID = 'auto-lock-warning'
const DISCARDED_ID = 'auto-lock-discarded'

/**
 * Locks the vault on its own after a while without activity. See ADR-007 and issue #220.
 *
 * It lives loose inside the router and not inside a page: it has to be mounted while
 * there is a session, and mounting it in every screen would mean several clocks counting
 * the same thing.
 *
 * WHAT IT DOES WHEN LOCKING, and it is what avoids inventing a new state: exactly the
 * same as reloading the page. It discards the token and the key and leaves the user
 * remembered, which is what `clearSession` does by design, so the user ends up on the
 * usual unlock screen — the one that does not ask for the email, greets them by it and
 * explains why it happened. Locking is not evicting, and that path is already tested.
 *
 * It does not tell the server. The token dies here just as it dies on reload, and
 * putting a request into a background timer would add one more possible failure — a
 * downed network leaving the lock half done — in exchange for revoking a little earlier
 * a token that only lived in this tab's memory.
 */
export function AutoLock() {
  const token = useSession((state) => state.token)
  const key = useVaultKey((state) => state.key)
  const navigate = useNavigate()

  /*
   * In a ref and not in state: it changes with every key pressed, and keeping it in
   * state would repaint the whole application for typing.
   *
   * It starts at zero and not at `Date.now()` because reading the clock during render is
   * impure — the `react-hooks/purity` rule flags it — and with concurrent rendering it
   * could give two different values for the same mount. The real value is set by the
   * effect before it gets read, which is the only place it matters.
   */
  const lastActivity = useRef(0)
  const warned = useRef(false)

  const active = Boolean(token && key)

  useEffect(() => {
    if (!active) {
      return
    }

    lastActivity.current = Date.now()
    warned.current = false

    const markActivity = () => {
      lastActivity.current = Date.now()

      if (warned.current) {
        warned.current = false
        toast.dismiss(WARNING_ID)
      }
    }

    const check = () => {
      const idle = Date.now() - lastActivity.current
      const state = idleStateFor(idle)

      if (state === 'expired') {
        /*
         * Read before clearing anything: locking unmounts the dialog that was
         * holding the work, and by then there is nothing left to ask.
         */
        const lostWork = hasUnsavedWork()
        const lostRecoveryKey = hasUnsavedRecoveryKey()

        useSession.getState().clearSession()
        useVaultKey.getState().forget()
        toast.dismiss(WARNING_ID)
        navigate('/desbloquear', { replace: true })

        /*
         * Said again after the fact, because the warning only helps whoever was
         * there to read it. Whoever comes back to a vanished dialog gets told why
         * instead of wondering whether they ever wrote it.
         */
        if (lostWork) {
          /*
           * It stays until dismissed, and that is the whole point: this fires because
           * nobody was at the keyboard, so a notice that fades after four seconds
           * would be read by no one — by definition of when it happens.
           *
           * THE RECOVERY KEY GETS ITS OWN SENTENCE, and it is not a nicety (#329).
           * «Se ha descartado lo que estabas escribiendo» describes a lost draft, and
           * what has been lost is the only readable copy of a key that IS ALREADY
           * REGISTERED: the account will say it has one. Whoever reads the generic
           * sentence has no reason to do anything; whoever reads this one knows they
           * have to generate another, and knows it today instead of on the day they
           * need it.
           */
          toast.warning(
            lostRecoveryKey
              ? 'Se ha descartado la clave de recuperación que no llegaste a guardar. Tu cuenta figura con una activa, así que genera otra: esa ya no la tiene nadie.'
              : 'Se ha descartado lo que estabas escribiendo, sin guardar.',
            { id: DISCARDED_ID, duration: Infinity },
          )
        }

        return
      }

      if (state === 'warning' && !warned.current) {
        warned.current = true

        /*
         * The warning names what is at stake, and only when something is. Saying it
         * every time would train the reader to skip the sentence that matters on the
         * one occasion it is true — see #303.
         */
        const seconds = secondsUntilLock(idle)

        toast.warning(
          hasUnsavedRecoveryKey()
            ? `Tu vault se bloqueará en ${seconds} segundos por inactividad, y la clave de recuperación que tienes en pantalla desaparecerá sin que quede copia.`
            : hasUnsavedWork()
              ? `Tu vault se bloqueará en ${seconds} segundos por inactividad, y se perderá lo que has escrito sin guardar.`
              : `Tu vault se bloqueará en ${seconds} segundos por inactividad.`,
          { id: WARNING_ID, duration: Infinity },
        )
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true })
    }

    /*
     * And on coming back to the tab it is checked immediately, without waiting for the
     * interval. While it was hidden the browser may have throttled it, so this is the
     * moment the accumulated gap shows: if it is time to lock, it is time now.
     */
    document.addEventListener('visibilitychange', check)
    const interval = window.setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity)
      }

      document.removeEventListener('visibilitychange', check)
      window.clearInterval(interval)
      toast.dismiss(WARNING_ID)
    }
  }, [active, navigate])

  return null
}
