import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { hasUnsavedRecoveryKey, hasUnsavedWork } from '@/lib/vault/unsavedWork'
import { lockVault } from './lockVault'
import {
  ACTIVITY_EVENTS,
  CHECK_INTERVAL_MS,
  idleStateFor,
  secondsUntilLock,
} from '@/lib/vault/autoLock'

const WARNING_ID = 'auto-lock-warning'

/**
 * Locks the vault on its own after a while without activity. See ADR-007 and issue #220.
 *
 * It lives loose inside the router and not inside a page: it has to be mounted while
 * there is a session, and mounting it in every screen would mean several clocks counting
 * the same thing.
 *
 * WHAT IT DOES WHEN LOCKING is `lockVault`, the same path the user menu and the keyboard
 * shortcut take (#788): exactly what reloading the page does, so no new state is invented.
 * Why it does not tell the server is written there.
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
        toast.dismiss(WARNING_ID)
        lockVault(navigate)
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
