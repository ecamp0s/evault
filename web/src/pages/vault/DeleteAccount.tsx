import { useState } from 'react'
import { Link } from 'react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/app/AppLayout'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { ApiError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { DecryptionError, normalizeEmail } from '@/lib/vault/crypto'
import { deleteAccount } from '@/lib/vault/deleteAccount'

/** What went wrong, keeping the reassurance that matters: nothing was deleted. */
function failureMessage(error: unknown): string {
  if (error instanceof DecryptionError) {
    return 'Esa no es tu contraseña maestra. No se ha borrado nada.'
  }

  if (error instanceof ApiError && error.isNetwork) {
    return 'No hemos podido conectar. No se ha borrado nada.'
  }

  if (error instanceof ApiError && error.state === 429) {
    return 'Demasiados intentos. Espera un rato antes de volver a probar. No se ha borrado nada.'
  }

  return 'No se ha podido borrar la cuenta. No se ha borrado nada.'
}

/**
 * Deleting the account. ADR-024, #715.
 *
 * WHAT IT SAYS BEFORE ASKING is most of the screen, and it is ADR-024 §2.3 in the order a
 * person needs it: what goes, that there is no way back, how to take the passwords first,
 * and then what the server CANNOT reach —the backups, the offline copy on other devices,
 * the passkeys in the system's own manager—. A confirmation that hides any of that is not
 * a confirmation anybody could give.
 *
 * THE BUTTON STAYS DISABLED UNTIL THE EMAIL IS TYPED EXACTLY, and the API compares it
 * again (§2.5): the screen is the convenience and the application is the barrier. The
 * email is compared the way the login compares it, so capitals and spaces do not count.
 *
 * NOT OFFERED OFFLINE: it is a write (ADR-019), and an offline session has no token.
 */
export function DeleteAccount() {
  const user = useSession((state) => state.user)
  const offline = useSession((state) => state.offline)

  const [typedEmail, setTypedEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accountEmail = user?.email ?? ''
  const confirmed =
    accountEmail !== '' && normalizeEmail(typedEmail) === normalizeEmail(accountEmail) && password !== ''

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!confirmed) return

    setWorking(true)
    setError(null)

    try {
      await deleteAccount(accountEmail, typedEmail, password)
      toast.success('Tu cuenta se ha borrado.')
    } catch (failure) {
      setError(failureMessage(failure))
      setWorking(false)
    }
  }

  return (
    <AppLayout title="Borrar la cuenta">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm">
          Se borrará <strong>todo</strong>: tu vault con todas sus entradas —también las de la
          papelera—, tus passkeys, tu clave de recuperación y todas tus sesiones.{' '}
          <strong>No tiene vuelta atrás</strong>: nadie, tampoco quien administra esta
          instancia, podrá recuperarla.
        </p>

        <p className="text-sm">
          Si quieres llevarte tus contraseñas, <strong>expórtalas antes</strong> desde la{' '}
          <Link to="/" className="underline underline-offset-4">
            vault
          </Link>
          .
        </p>

        <Notice>
          Hay tres cosas que no se pueden borrar desde aquí:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Las copias de seguridad</strong> de esta instancia conservan tu cuenta
              hasta que se renuevan, unas semanas. Van cifradas, y solo se abren con lo que ya
              la abría.
            </li>
            <li>
              <strong>La copia sin conexión de otros dispositivos</strong>, si la activaste,
              sigue abriéndose con tu contraseña maestra. Bórrala en cada uno con «Olvidar
              esta cuenta en este dispositivo».
            </li>
            <li>
              <strong>Tus passkeys</strong> dejan de servir, pero siguen en el gestor de
              passkeys de tu dispositivo —iCloud, Windows Hello— hasta que los quites allí.
            </li>
          </ul>
        </Notice>

        {offline ? (
          <Notice>
            Estás viendo la copia guardada en este dispositivo, sin conexión con tu servidor,
            así que no se puede borrar la cuenta. Vuelve a conectar.
          </Notice>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="confirmEmail">
                Escribe tu correo, {accountEmail}, para confirmar
              </FieldLabel>
              <Input
                id="confirmEmail"
                type="email"
                autoComplete="off"
                value={typedEmail}
                onChange={(event) => setTypedEmail(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="masterPassword">Contraseña maestra</FieldLabel>
              <Input
                id="masterPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div>
              <Button type="submit" variant="destructive" disabled={!confirmed || working}>
                {working && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {working ? 'Borrando la cuenta…' : 'Borrar mi cuenta para siempre'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  )
}
