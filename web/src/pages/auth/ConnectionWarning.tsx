import { useEffect, useState } from 'react'
import { Notice } from '@/components/ui/notice'
import { useSession } from '@/lib/session'
import { useServerReachable } from '@/lib/serverReachable'
import { readCachedAccount } from '@/lib/vault/deviceCache'

/**
 * Says on the unlock screen that the server is not answering, before anybody types.
 *
 * WHY IT IS NOT `OfflineNotice`, WHICH ALREADY SAYS SOMETHING VERY SIMILAR: that one
 * reads `session.offline`, and on this screen the session is not offline yet — it becomes
 * so when the vault opens against the cache, which is after. There is nothing for it to
 * read here, so the state has to be asked for instead of remembered.
 *
 * WHAT IT ADDS IS THE HALF THAT CHANGES WHAT SOMEBODY DOES. «There is no connection» is
 * a fact; whether this device holds a copy is what decides whether typing a master
 * password is worth the trouble. Without it, the honest version of this screen would be
 * «something is wrong, try and see», which is what it already was.
 *
 * IT PAINTS NOTHING UNTIL IT KNOWS BOTH THINGS. Showing «no connection» and then
 * refining it a moment later reads as the screen changing its mind, and both answers
 * arrive in milliseconds — the probe was measured at 9-23 ms against a stopped server.
 */
export function ConnectionWarning() {
  const reachability = useServerReachable()
  const email = useSession((state) => state.rememberedUser?.email)
  const [hasCopy, setHasCopy] = useState<boolean | null>(null)

  useEffect(() => {
    if (reachability !== 'unreachable' || !email) return

    let current = true

    void readCachedAccount(email).then((cached) => {
      if (current) setHasCopy(cached !== null)
    })

    return () => {
      current = false
    }
  }, [reachability, email])

  if (reachability !== 'unreachable' || hasCopy === null) {
    return null
  }

  return (
    <Notice role="status">
      {hasCopy ? (
        <>
          No hay conexión con el servidor. Puedes desbloquear igualmente: este dispositivo
          guarda una copia de tu vault, y podrás consultarla aunque no hacer cambios.
        </>
      ) : (
        <>
          No hay conexión con el servidor, y este dispositivo no guarda ninguna copia de tu
          vault. No vas a poder entrar hasta que vuelva la conexión.
        </>
      )}
    </Notice>
  )
}
