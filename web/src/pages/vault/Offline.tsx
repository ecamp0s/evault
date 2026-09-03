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
 * WHAT THE TEXT HAS TO SAY, and it is the whole of the screen: what it buys, what is
 * kept and how, what it costs, and what to do about it. The cost is the part that is
 * tempting to leave out — `ADR-019` §2 is explicit that a cached vault takes the rate
 * limiting out of the way, and somebody deciding needs that in front of them, not in a
 * document.
 *
 * THAT ORDER IS THE #498 ORDER, AND IT REPLACES ONE THAT READ WORSE. The screen used to
 * open on what the thing is and leave the uses trailing, which is the order somebody
 * writes in when they already know the answer. Read by somebody who did not, half the
 * point never arrived. The order now runs use, mechanics, cost, instruction.
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
        {/*
          * WHAT IT BUYS GOES FIRST, AND THAT ORDER WAS MEASURED. The screen used to open
          * on what the thing is, with the three uses trailing at the end of that same
          * sentence — no wifi, travelling, or the machine at home being switched off.
          * Somebody who had never seen it read that and came away with the first case
          * only. See #470 and #498.
          */}
        <p className="text-sm">
          Con una copia guardada aquí puedes{' '}
          <strong>consultar tus contraseñas aunque este dispositivo no llegue al servidor</strong>
          .
        </p>

        {/*
          * The two cases apart, and the second one explaining what the server is.
          *
          * WHY IT IS SPELLED OUT: the reader of the #470 test got «I lose my internet»,
          * which is the phone's case, and concluded the option was of little use on the
          * very laptop they were testing on. They never reached «the server is down» on
          * their own — the case that applies MOST there — and only got it when somebody
          * said it out loud, at which point they wanted the option on.
          *
          * Nobody has to know that eVault runs on a machine that gets turned off, so the
          * sentence says it instead of assuming it.
          */}
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>Cuando te quedas sin wifi o sin datos, en el metro o de viaje.</li>
          <li>
            Cuando el servidor no responde: eVault vive en un ordenador que puede estar
            apagado, reiniciándose o inalcanzable, y eso no depende de ti.
          </li>
        </ul>

        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Se guarda cifrada</strong>, igual que en el
          servidor, y hace falta tu contraseña maestra para abrirla. Sin ella no sirve de
          nada, ni para ti ni para nadie.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Solo para consultar.</strong> No puedes
          crear, editar ni borrar entradas hasta que vuelvas a tener conexión.
        </p>

        {/*
          * The cost, said where the decision is made. ADR-019 §2 is explicit that a
          * cached vault removes the rate limiting, and somebody choosing has to see that
          * next to what they gain — not find it in a document afterwards.
          *
          * THE AMBER STAYS, AND THAT IS THE OPPOSITE OF WHAT THE #470 READER SEEMED TO BE
          * ASKING FOR. They read this as a recommendation while «the colours and so on»
          * made it look like a warning. But the amber did its job: they read the block
          * whole, in spite of finding the page a chore. Toning down the one thing on the
          * screen that must not be skipped, because it is uncomfortable, would be trading
          * a real disclosure for a nicer page.
          *
          * WHAT WAS MISSING WAS NOT LESS COLOUR BUT AN INSTRUCTION. A stated cost with no
          * «so do this» leaves the reader holding an alarm they cannot act on, so the
          * block now ends in the sentence that decides.
          */}
        <Notice>
          A cambio, quien tenga este dispositivo puede intentar adivinar tu contraseña
          maestra todas las veces que quiera, sin que el servidor se lo impida.
          <strong className="mt-2 block">
            Actívalo si este dispositivo es solo tuyo. Si lo usa alguien más, déjalo
            apagado.
          </strong>
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
