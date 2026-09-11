import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { Loader2, Lock, ScanFace } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { forgetAccountOnThisDevice, unlock } from '@/lib/auth'
import { useSession } from '@/lib/session'
import { ApiError } from '@/lib/api'
import { DecryptionError } from '@/lib/vault/crypto'
import { VaultUnreachable } from '@/lib/vault/unlock'
import { PasskeyUnsupported, isPasskeySupported } from '@/lib/vault/passkey'
import { unlockWithPasskey } from '@/lib/vault/passkeyAccount'
import { AuthLayout } from './AuthLayout'
import { ConnectionWarning } from './ConnectionWarning'
import { ErrorBanner } from './ErrorBanner'
import { CANNOT_OPEN_VAULT, generalMessage } from './errors'

const schema = z.object({
  password: z.string().min(1, 'Escribe tu contraseña maestra'),
})

type UnlockData = z.infer<typeof schema>

/**
 * Locking the vault, which is what happens on reload now that the token lives in
 * memory only.
 *
 * The difference from the login is not technical but one of what the user is told.
 * ADR-007 asks for it explicitly: «The interface presents it as a lock and not as an
 * eviction: the user is still the same, what is missing is the master password.» Hence
 * there being no email field, the greeting by name, and the text explaining why it
 * happened instead of taking for granted that it is understood.
 *
 * Underneath it does a full login, but that is an implementation detail the interface
 * has no reason to tell.
 */
export function Unlock() {
  const navigate = useNavigate()
  const location = useLocation()
  const rememberedUser = useSession((state) => state.rememberedUser)

  const [generalError, setGeneralError] = useState<string | null>(null)
  const [usingPasskey, setUsingPasskey] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  const target = (location.state as { from?: string } | null)?.from ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UnlockData>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  })

  const submit = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await unlock(data.password)
      navigate(target, { replace: true })
    } catch (error) {
      if (error instanceof DecryptionError || error instanceof VaultUnreachable) {
        setGeneralError(CANNOT_OPEN_VAULT)

        return
      }

      if (!(error instanceof ApiError)) {
        throw error
      }

      /*
       * A 401 here means a wrong password, not an expired session: there was no session
       * to expire. The text from mensajeGeneral talks about email and password, and here
       * the email has not been typed, so what fits is said instead.
       */
      setGeneralError(
        error.isCredentials ? 'Esa no es tu contraseña maestra.' : generalMessage(error),
      )
    }
  })

  /*
   * The passkey path, which shares nothing with the form above except where it lands.
   *
   * WHAT IT MUST NOT DO IS TREAT A CANCELLED DIALOG AS A FAILURE. Somebody who dismisses
   * Face ID changed their mind; saying «no se ha podido» would be the application
   * arguing with them, and it would sit there next to a password field they were about
   * to use anyway.
   */
  const withPasskey = async () => {
    setGeneralError(null)
    setUsingPasskey(true)

    try {
      await unlockWithPasskey()
      await navigate(target, { replace: true })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') return

      /*
       * A failure here is NOT «your passkey is gone», and the difference matters more
       * than it reads. Coming in by a hostname the passkey was not registered under, the
       * browser finds no credential — the passkey is intact and works by its own name
       * (#578). Saying it stopped existing would send somebody to register a second one
       * for a problem they do not have.
       */
      setGeneralError(
        error instanceof PasskeyUnsupported
          ? 'No hemos encontrado ningún passkey para esta dirección. Entra con tu contraseña maestra.'
          : error instanceof DecryptionError || error instanceof VaultUnreachable
            ? CANNOT_OPEN_VAULT
            : 'No hemos podido desbloquear con el passkey. Usa tu contraseña maestra.',
      )
    } finally {
      setUsingPasskey(false)
    }
  }

  return (
    <AuthLayout
      title="Tu vault está bloqueada"
      description={
        rememberedUser
          ? `Introduce la contraseña maestra de ${rememberedUser.email} para volver a abrirla.`
          : 'Introduce tu contraseña maestra para volver a abrirla.'
      }
      footer={{
        text: '¿No es tu cuenta?',
        link: { to: '/login', text: 'Entra con otra' },
      }}
    >
      <ErrorBanner message={generalError} />

      {/*
        * Above the explanation and below the error, because it changes what somebody is
        * about to do: with no connection and no copy on this device, typing the master
        * password is wasted effort — and that was found by doing exactly that (#492).
        *
        * It paints nothing while it does not know, so the form never waits for it.
        */}
      <ConnectionWarning />

      <div className="flex gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">
          Al cerrar o recargar la página, la llave que descifra tu vault se borra de la
          memoria. Tus datos siguen aquí, cifrados.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="password">Contraseña maestra</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          {errors.password && <FieldError>{errors.password.message}</FieldError>}
        </Field>

        {/*
          * NOT disabled while the passkey is working, and that is deliberate rather than
          * an oversight. Found by clicking the passkey button in a real browser with no
          * authenticator: the system dialog sits there waiting, and with the form
          * disabled the master password — the MAIN way in by ADR-021 — was unreachable
          * until something resolved it.
          *
          * The two paths are independent and neither owes the other a turn. Whoever
          * reaches for the shortcut and thinks better of it can just type.
          */}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Abriendo tu vault…' : 'Desbloquear'}
        </Button>
      </form>

      {/*
        * BEHIND THE MASTER PASSWORD AND NOT IN FRONT OF IT, decided when the iteration
        * was planned: the two coexist and the master password is the main way in. It is
        * also why the field above keeps `autoFocus` — a passkey is a shortcut somebody
        * reaches for, not the default.
        *
        * It is not painted when this browser has no PRF, rather than painted disabled: a
        * disabled control invites working out how to enable it, and there is nothing to
        * enable. What to do instead is the subject of #563.
        */}
      {isPasskeySupported() && (
        <Button
          type="button"
          variant="outline"
          /*
           * `mt-2` because there was nothing: measured at zero pixels, the only pair on
           * this screen with no separation at all. The gap that spaces everything else
           * belongs to the `<form>` and reaches only its own children, and this button is
           * outside it on purpose — inside, it would submit the form. `CardContent`, which
           * holds them both, is padding and nothing else: no flex, no gap.
           *
           * Eight and not sixteen. Sixteen is what the form uses between its own fields,
           * and at that distance these two read as unrelated controls; at eight they read
           * as two ways of doing the same thing, which is what the solid and the outline
           * already say. See #604.
           */
          className="mt-2 w-full"
          disabled={isSubmitting || usingPasskey}
          onClick={() => void withPasskey()}
        >
          {usingPasskey ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ScanFace className="size-4" aria-hidden="true" />
          )}
          {usingPasskey ? 'Abriendo tu vault…' : 'Desbloquear con un passkey'}
        </Button>
      )}

      {/*
        * The emergency exit goes here and not only in the login, because this is the
        * place where somebody discovers they cannot remember: they already know who
        * they are, what they do not recall is the password.
        */}
      <p className="border-t pt-4 text-center text-sm text-muted-foreground">
        <Link to="/recover" className="underline underline-offset-4 hover:text-foreground">
          He olvidado mi contraseña maestra
        </Link>
      </p>

      {/*
        * An explicit way out for the shared computer and for whoever has two accounts.
        * Without this there would be no way to remove the remembered email, and the
        * link in the footer would lead to the login with the previous account still
        * stored.
        *
        * IT USED TO BE A `ghost` BUTTON IN MUTED GREY, and it read as a caption: a
        * screen reader announced it correctly and eyes did not find it at all. That
        * mattered more than it looks, because THIS IS THE ONLY PLACE IN THE APPLICATION
        * that deletes this device's cached copy for ONE account — «Cerrar sesión» does
        * it without saying so, and the switch in /offline only does it for every account
        * at once. The cleanup before the #544 reset leans on this button, and whoever
        * owns the vault had stood in front of this screen many times without seeing it
        * (#550).
        *
        * WHAT MAKES IT SAFE TO SHOW IS THE CONFIRMATION, not the styling. With a step in
        * between it can look like a control without inviting a mis-click, and it can say
        * the part that decides: the data is on the server and nothing is lost — what it
        * costs is typing the email again.
        *
        * The other `ghost` buttons in the project were checked, which #550 asked for:
        * they are «Cancelar» and «Volver», with no consequence. This was the only one
        * spending that treatment on something destructive.
        */}
      {forgetting ? (
        <div
          role="alertdialog"
          aria-label="Confirmar"
          className="flex flex-col gap-3 rounded-md border p-3"
        >
          <p className="text-sm">
            Se borrará de este dispositivo el correo recordado y la copia de tu vault.{' '}
            <strong>No pierdes nada</strong>: tus datos siguen en el servidor, y para
            volver a entrar tendrás que escribir tu correo y tu contraseña maestra.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                /*
                 * Through `forgetAccountOnThisDevice` and not the store's `forgetUser`:
                 * the button says «forget this account on this device», and that has to
                 * include the copy of the vault. Calling the store straight would forget
                 * the email and leave the vault behind, without anything failing.
                 */
                void forgetAccountOnThisDevice().then(() =>
                  navigate('/login', { replace: true }),
                )
              }}
            >
              Olvidar esta cuenta
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setForgetting(false)}>
              Dejarlo como está
            </Button>
          </div>
        </div>
      ) : (
        /*
         * CENTRED BY ITS OWN ROW, because `self-center` on the button did nothing (#655):
         * it only works inside a flex container, and `CardContent` is a plain block. The
         * class said «centred» while the button hugged the left edge under a centred
         * link, and only a look at the real screen caught it.
         */
        <div className="mt-2 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            /*
             * Separated by a rule, and it is not decoration. Everything above answers «how
             * do I get in»; this answers «this is not my account», which is the same
             * question the footer below asks. Sitting flush under the passkey button it
             * competed with it — two outline controls in a row, and the eye reads them as
             * a pair of alternatives.
             *
             * Lighter text than the two above it for the same reason, with the border
             * doing the work of saying it is a control. Seen at 390px, which is where four
             * stacked controls stop having room to breathe.
             */
            className="border-t-0 text-muted-foreground"
            onClick={() => setForgetting(true)}
          >
            Olvidar esta cuenta en este dispositivo
          </Button>
        </div>
      )}
    </AuthLayout>
  )
}
