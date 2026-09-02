import { useState } from 'react'
import { AppLayout } from '@/components/app/AppLayout'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { useSession } from '@/lib/session'
import { useActiveVault } from '@/lib/vault/hooks'
import { listItems, listVaults } from '@/lib/vault/api'
import { forgetEveryCachedAccount, isCacheSupported } from '@/lib/vault/deviceCache'
import { useOfflinePreference } from '@/lib/vault/offlinePreference'

/**
 * Where somebody decides whether this device keeps a copy of their vault. See ADR-019.
 *
 * IT IS A PAGE AND NOT A SWITCH IN THE MENU, because of what `ADR-019` §6.4 asks: this
 * has to be explained where it is decided, to somebody who did not build it. The other
 * account on this instance does not know what a service worker is and has no reason to,
 * and a toggle with a four-word label would be asking them to consent to something
 * nobody described.
 *
 * WHAT THE TEXT HAS TO SAY, and it is the whole of the screen: what is kept, where, what
 * it buys, and what it costs. The cost is the part that is tempting to leave out —
 * `ADR-019` §2 is explicit that a cached vault takes the rate limiting out of the way,
 * and somebody deciding needs that in front of them, not in a document.
 *
 * TURNING IT ON SEEDS THE COPY THERE AND THEN, rather than leaving it for whenever the
 * list is next fetched. Otherwise the switch would say yes and the device would stay
 * empty until something else happened to happen, and the first time it mattered — no
 * network — would be the first time anybody found out.
 */
export function Offline() {
  const enabled = useOfflinePreference((state) => state.enabled)
  const setEnabled = useOfflinePreference((state) => state.setEnabled)
  const offline = useSession((state) => state.offline)
  const { data: vault } = useActiveVault()

  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  const supported = isCacheSupported()

  const turnOn = async () => {
    setWorking(true)
    setFailed(false)
    setEnabled(true)

    try {
      /*
       * The two ordinary reads, which is what fills the cache: `listVaults` stores the
       * wrapped key and `listItems` the ciphertext. Nothing special is written here, so
       * there is no second way of building the copy that could drift from the first.
       */
      await listVaults()

      if (vault) await listItems(vault.id)
    } catch {
      /*
       * The preference stays on. What failed is the seeding, not the decision, and the
       * next successful read will fill it — saying «it did not work» while quietly
       * turning the switch back off would be describing something that did not happen.
       */
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }

  const turnOff = async () => {
    setWorking(true)
    setEnabled(false)

    // The copy goes now, and not when something next happens to run.
    await forgetEveryCachedAccount()

    setWorking(false)
  }

  return (
    <AppLayout title="Sin conexión">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Este dispositivo puede guardar una copia de tu vault para que puedas consultarla
          cuando el servidor no esté disponible: sin wifi, de viaje, o si el ordenador de
          casa está apagado.
        </p>
        <p className="text-sm text-muted-foreground">
          La copia se guarda <strong>cifrada</strong>, igual que en el servidor, y hace
          falta tu contraseña maestra para abrirla. Sin ella no sirve de nada, ni para ti
          ni para nadie.
        </p>
        <p className="text-sm text-muted-foreground">
          Con la copia puedes <strong>consultar</strong> tus entradas. No puedes crear,
          editar ni borrar hasta que vuelvas a tener conexión.
        </p>

        {/*
          * The cost, said where the decision is made. ADR-019 §2 is explicit that a
          * cached vault removes the rate limiting, and somebody choosing has to see that
          * next to what they gain — not find it in a document afterwards.
          */}
        <Notice>
          A cambio, quien tenga este dispositivo puede intentar adivinar tu contraseña
          maestra todas las veces que quiera, sin que el servidor se lo impida. Si el
          dispositivo no es solo tuyo, o lo pierdes con facilidad, es mejor dejarlo
          apagado.
        </Notice>

        {!supported && (
          <Notice>
            Este navegador no permite guardar nada, así que la opción no tendría efecto.
            Suele pasar en las ventanas privadas.
          </Notice>
        )}

        {failed && (
          <p role="alert" className="text-sm text-destructive">
            La opción ha quedado activada, pero no se ha podido guardar la copia ahora
            mismo. Se guardará la próxima vez que se cargue la lista.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            {enabled
              ? 'Este dispositivo guarda una copia de tu vault.'
              : 'Este dispositivo no guarda ninguna copia.'}
          </p>

          {enabled ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={working}
              onClick={() => void turnOff()}
            >
              Dejar de guardar y borrar la copia
            </Button>
          ) : (
            <Button
              className="self-start"
              /*
               * Seeding needs the network and an open vault. Offline, the switch would
               * turn on and store nothing, so it says why instead of failing quietly.
               */
              disabled={working || !supported || offline}
              onClick={() => void turnOn()}
            >
              Guardar una copia en este dispositivo
            </Button>
          )}

          {offline && !enabled && (
            <p className="text-sm text-muted-foreground">
              Ahora mismo no hay conexión, así que no se puede guardar la copia todavía.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
