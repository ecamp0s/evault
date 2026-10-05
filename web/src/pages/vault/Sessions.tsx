import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/app/AppLayout'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { useSession } from '@/lib/session'
import {
  closeOtherSessions,
  closeSession,
  listSessions,
  type OpenSession,
  type SessionClient,
} from '@/lib/sessions'
import { queryKeys } from '@/lib/vault/queryKeys'

/** What each client is called on screen. */
const CLIENT_NAMES: Record<Exclude<SessionClient, null>, string> = {
  web: 'Navegador',
  // `extension` is Chrome's: it was the only one when #711 named it, and stays so (#753).
  extension: 'Extensión de Chrome',
  'extension-firefox': 'Extensión de Firefox',
  recovery: 'Recuperación de la cuenta',
}

function clientName(client: SessionClient): string {
  // A token from before clients said which they were, or from an extension built before
  // #711. The API does not guess and neither does the screen.
  return client ? CLIENT_NAMES[client] : 'Sin identificar'
}

/**
 * A date with its time, in Spanish: a session lives twelve hours, so the day alone would
 * say nothing. `es-ES` spelled out, for the reason `Passkeys` gives.
 */
function formatMoment(iso: string | null): string {
  const date = iso ? new Date(iso) : null

  if (!date || Number.isNaN(date.getTime())) return 'una fecha que no se ha podido leer'

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * The account's open sessions, and closing them without rotating the master password.
 * ADR-018 §2.5, #711 and #712.
 *
 * IT SAYS WHAT IT DOES NOT COVER, and that is a criterion of #712 and not a courtesy.
 * Closing sessions ends who is inside; it does not stop them coming back, because a
 * passkey or the recovery key still open the vault. Somebody who suspects a theft needs
 * that sentence here, with the way to each of the other two, and not in a document.
 *
 * THE ONE ASKING IS NOT CLOSED FROM HERE. Closing it is signing out, which has its own
 * place in the menu and its own consequences on this device; a button here would be a
 * second «Cerrar sesión» that looks like something else.
 */
export function Sessions() {
  const offline = useSession((state) => state.offline)
  const queryClient = useQueryClient()
  const { data: sessions, isPending, isError } = useQuery<OpenSession[]>({
    queryKey: queryKeys.sessions(),
    queryFn: listSessions,
    // Offline there is no token, so there is no one to ask.
    enabled: !offline,
  })

  const [working, setWorking] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const others = (sessions ?? []).filter((session) => !session.current)

  const act = async (work: () => Promise<string>) => {
    setWorking(true)
    setOutcome(null)
    setError(null)

    try {
      setOutcome(await work())
    } catch {
      setError('No hemos podido cerrar la sesión. Inténtalo de nuevo.')
    } finally {
      setWorking(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
    }
  }

  const closeOthers = () =>
    act(async () => {
      const closed = await closeOtherSessions()

      return closed === 1 ? 'Se ha cerrado 1 sesión.' : `Se han cerrado ${closed} sesiones.`
    })

  const closeOne = (session: OpenSession) =>
    act(async () => {
      await closeSession(session.id)

      return `Se ha cerrado la sesión de ${clientName(session.client).toLowerCase()}.`
    })

  return (
    <AppLayout title="Sesiones abiertas">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm">
          Cada vez que entras en tu vault, desde el navegador o desde la extensión, se abre
          una sesión que dura como mucho doce horas. Aquí puedes ver cuáles hay y{' '}
          <strong>cerrar las que no reconozcas</strong> sin cambiar tu contraseña maestra.
        </p>

        <Notice>
          Cerrar una sesión echa a quien la esté usando, pero{' '}
          <strong>no le impide volver a entrar</strong>: un passkey o la clave de
          recuperación siguen abriendo tu vault. Si sospechas que alguien tiene acceso, quita
          los{' '}
          <Link to="/passkeys" className="underline underline-offset-4">
            passkeys
          </Link>{' '}
          que no reconozcas, crea una{' '}
          <Link to="/recovery-key" className="underline underline-offset-4">
            clave de recuperación
          </Link>{' '}
          nueva y cambia tu{' '}
          <Link to="/master-password" className="underline underline-offset-4">
            contraseña maestra
          </Link>
          .
        </Notice>

        {offline && (
          <Notice>
            Estás viendo la copia guardada en este dispositivo, sin conexión con tu servidor,
            así que no se pueden ver ni cerrar sesiones. Vuelve a conectar.
          </Notice>
        )}

        {!offline && isError && (
          <p role="alert" className="text-sm text-destructive">
            No hemos podido leer tus sesiones. Recarga la página.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {outcome && (
          <p role="status" className="text-sm">
            {outcome}
          </p>
        )}

        {!offline && !isError && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">
              {isPending
                ? 'Buscando tus sesiones…'
                : `${sessions.length} ${sessions.length === 1 ? 'sesión abierta' : 'sesiones abiertas'}`}
            </h2>

            {sessions?.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {clientName(session.client)}
                    {session.current && (
                      <span className="text-muted-foreground"> · la que estás usando</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.last_used_at
                      ? `Usada por última vez el ${formatMoment(session.last_used_at)}`
                      : `Abierta el ${formatMoment(session.created_at)}, todavía sin usar`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Caduca el {formatMoment(session.expires_at)}
                  </span>
                </div>

                {!session.current && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={working}
                    onClick={() => void closeOne(session)}
                  >
                    Cerrar
                  </Button>
                )}
              </div>
            ))}

            {others.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={working}
                onClick={() => void closeOthers()}
              >
                Cerrar las demás sesiones
              </Button>
            )}
          </section>
        )}
      </div>
    </AppLayout>
  )
}
