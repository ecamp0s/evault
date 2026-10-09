import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { KeyRound, ScanFace, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isDismissed, useGettingStarted } from '@/lib/gettingStarted'
import { useSession } from '@/lib/session'
import { isPasskeySupported } from '@/lib/vault/passkey'
import { listPasskeys, type AccountPasskey } from '@/lib/vault/passkeyAccount'
import { queryKeys } from '@/lib/vault/queryKeys'

/**
 * The first steps an account has not taken, at the top of the vault (#790).
 *
 * Until #790 a new account landed on the empty vault and nothing said that without a
 * recovery key, forgetting the master password loses everything (ADR-010), nor that a
 * passkey exists (ADR-021): both lived in the user menu, among nine entries. It is for
 * accounts that already exist too — one with no recovery key sees it on opening the vault,
 * and that is the point and not a side effect.
 *
 * DERIVED, NOT STORED: each step is shown while it is still true of the account and goes
 * away on its own once it is not. Only closing the whole card is remembered, in this
 * browser (lib/gettingStarted.ts).
 *
 * NOTHING OFFLINE: there the session has no user from the server, so whether a recovery
 * key exists is not known, and a card built on a guess would be asking for something
 * already done.
 *
 * THE EXTENSION IS NOT A STEP: there is no store to install it from, because each one is
 * built for its instance (ADR-023 §2.5).
 */
export function GettingStarted() {
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const dismissed = useGettingStarted((state) => state.dismissed)
  const dismiss = useGettingStarted((state) => state.dismiss)

  /*
   * The same query the passkeys screen uses, so adding one there takes this step away
   * here without anything else to keep in sync. Not asked at all where a passkey cannot be
   * made, nor while the card is hidden. If it fails, the step is left out rather than
   * shown on a guess.
   */
  const passkeySupported = isPasskeySupported()
  const hidden = !user || isDismissed(dismissed, user.email)
  const passkeys = useQuery<AccountPasskey[]>({
    queryKey: queryKeys.passkeys(),
    queryFn: listPasskeys,
    enabled: !hidden && passkeySupported,
  })

  if (!user || hidden) {
    return null
  }

  const needsRecoveryKey = !user.has_recovery_key
  const needsPasskey = passkeySupported && passkeys.data !== undefined && passkeys.data.length === 0

  if (!needsRecoveryKey && !needsPasskey) {
    return null
  }

  return (
    <section
      aria-labelledby="getting-started-title"
      className="relative mb-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 size-7"
        aria-label="Ocultar los primeros pasos en este navegador"
        onClick={() => dismiss(user.email)}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>

      <h2 id="getting-started-title" className="text-sm font-medium">
        Primeros pasos
      </h2>
      <p className="mt-1 pr-8 text-sm text-muted-foreground">
        Conviene hacerlo antes de que haga falta.
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {needsRecoveryKey && (
          <li className="flex flex-wrap items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">Guarda una clave de recuperación</p>
              <p className="text-sm text-muted-foreground">
                Si olvidas la contraseña maestra, es lo único que te devuelve la vault. Nadie
                más puede restablecerla.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void navigate('/recovery-key')}>
              Crear la clave
            </Button>
          </li>
        )}
        {needsPasskey && (
          <li className="flex flex-wrap items-start gap-3">
            <ScanFace className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">Añade un passkey</p>
              <p className="text-sm text-muted-foreground">
                Para abrir la vault con la huella, el rostro o el PIN del dispositivo, sin
                teclear la contraseña maestra.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void navigate('/passkeys')}>
              Añadir un passkey
            </Button>
          </li>
        )}
      </ul>
    </section>
  )
}
