import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import {
  ACTIVITY_EVENTS,
  CHECK_INTERVAL_MS,
  idleStateFor,
  secondsUntilLock,
} from '@/lib/vault/autoLock'

const WARNING_ID = 'auto-lock-warning'

/**
 * Bloquea la vault sola tras un rato sin actividad. Ver ADR-007 y el issue #220.
 *
 * Vive suelto dentro del router y no dentro de una página: tiene que estar montado
 * mientras haya sesión, y montarlo en cada pantalla sería tener varios relojes
 * contando lo mismo.
 *
 * QUÉ HACE AL BLOQUEAR, y es lo que evita inventarse un estado nuevo: exactamente lo
 * mismo que recargar la página. Descarta el token y la clave y deja el usuario
 * recordado, que es lo que `clearSession` hace por diseño, así que el usuario acaba
 * en la pantalla de desbloqueo de siempre — la que no pide el correo, saluda con él y
 * explica por qué ha pasado. Bloquear no es expulsar, y ese camino ya está probado.
 *
 * No avisa al servidor. El token muere aquí igual que muere al recargar, y meter una
 * petición en un temporizador de fondo añadiría un fallo posible —una red caída
 * dejando el bloqueo a medias— a cambio de revocar antes un token que solo vivía en
 * la memoria de esta pestaña.
 */
export function AutoLock() {
  const token = useSession((state) => state.token)
  const key = useVaultKey((state) => state.key)
  const navigate = useNavigate()

  /*
   * En una ref y no en estado: cambia con cada tecla que se pulsa, y guardarlo en
   * estado repintaría la aplicación entera por escribir.
   *
   * Arranca en cero y no en `Date.now()` porque leer el reloj durante el render es
   * impuro —lo marca la regla `react-hooks/purity`— y con render concurrente podría
   * dar dos valores distintos para el mismo montaje. El valor real lo pone el efecto
   * antes de que llegue a leerse, que es el único sitio donde importa.
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
        useSession.getState().clearSession()
        useVaultKey.getState().forget()
        toast.dismiss(WARNING_ID)
        navigate('/desbloquear', { replace: true })

        return
      }

      if (state === 'warning' && !warned.current) {
        warned.current = true
        toast.warning(
          `Tu vault se bloqueará en ${secondsUntilLock(idle)} segundos por inactividad.`,
          { id: WARNING_ID, duration: Infinity },
        )
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true })
    }

    /*
     * Y al volver a la pestaña se comprueba de inmediato, sin esperar al intervalo.
     * Mientras estaba oculta el navegador pudo estrangularlo, así que este es el
     * momento en que el desfase acumulado se nota: si toca bloquear, toca ya.
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
