import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { readCachedAccount } from '@/lib/vault/deviceCache'

/**
 * Says, while it is true, that what is on screen came off this device and not the server.
 *
 * IT IS A CRITERION AND NOT DECORATION, and `ADR-019` §6.2 is why: reading a password
 * from three days ago believing it is today's is worse than not being able to read it.
 * The application works, the entry appears, the password copies, and the service rejects
 * it without saying why. **The failure this prevents is silent by definition**, which is
 * exactly the kind this project has learned to put a sentence in front of.
 *
 * THE DATE IS THE HALF THAT DOES THE WORK. «You are offline» is a state; «this is from
 * Tuesday» is the thing that lets somebody decide whether to trust what they are looking
 * at. A banner without it would be true and useless.
 *
 * IT DOES NOT USE `navigator.onLine`, and that is deliberate. It reports whether the
 * device is attached to a network, not whether kastor answers — a captive portal, a
 * dropped tailnet or a server that is simply off all read as «online». A banner that
 * announced «the connection is back» on that basis would be handing out a reassurance it
 * cannot support, which is worse than saying nothing.
 *
 * So the way back is an explicit action, and it is honest about its cost: reconnecting
 * means unlocking again, because an offline session has no token and this application
 * keeps nothing that could fetch one. It is the same lock `AutoLock` performs.
 *
 * THE DATE IS READ WITH AN EFFECT AND NOT WITH REACT QUERY, which was the first attempt
 * and was wrong. It is a single local value, read once, that cannot change while the
 * session stays offline — writing needs a network. React Query bought no refetching, no
 * sharing and no invalidation, and it cost something real: this component lives in the
 * application's frame, so needing a `QueryClientProvider` made every page test that
 * renders the frame need one too. The pattern followed the tool instead of the problem.
 */
export function OfflineNotice() {
  const offline = useSession((state) => state.offline)
  const email = useSession((state) => state.rememberedUser?.email)
  const navigate = useNavigate()
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!offline || !email) return

    let current = true

    void readCachedAccount(email).then((cached) => {
      // The account can change while this resolves; writing then would show one
      // person's date under another's session.
      if (current) setSavedAt(cached?.savedAt ?? null)
    })

    return () => {
      current = false
    }
  }, [offline, email])

  if (!offline) {
    return null
  }

  const reconnect = () => {
    useSession.getState().clearSession()
    useVaultKey.getState().forget()
    navigate('/unlock', { replace: true })
  }

  return (
    <div
      // `status` and not `alert`: it is worth announcing, but it must not interrupt what
      // somebody is doing to say something that will still be true in a minute.
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm md:px-6"
    >
      <CloudOff className="size-4 shrink-0 text-amber-600" aria-hidden="true" />

      <p className="min-w-0">
        Sin conexión. Estás viendo la copia guardada en este dispositivo
        {savedAt ? <>, del {formatSavedAt(savedAt)}</> : null}, así que puede no estar al
        día.
      </p>

      <Button variant="outline" size="sm" className="ml-auto" onClick={reconnect}>
        Volver a conectar
      </Button>
    </div>
  )
}

/**
 * The date, written the way somebody reads it out loud.
 *
 * Down to the minute because a vault can be cached twice in a day, and «del 2 de
 * septiembre» would then name two different sets of contents.
 */
function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt)

  // An unparseable date is not worth a broken sentence: the banner still says the
  // important half, which is that this came off the device.
  if (Number.isNaN(date.getTime())) {
    return 'una fecha que no se ha podido leer'
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
