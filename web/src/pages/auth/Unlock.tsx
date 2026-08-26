import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { Loader2, Lock } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { unlock } from '@/lib/auth'
import { useSession } from '@/lib/session'
import { ApiError } from '@/lib/api'
import { DecryptionError } from '@/lib/vault/crypto'
import { VaultUnreachable } from '@/lib/vault/unlock'
import { AuthLayout } from './AuthLayout'
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
  const forgetUser = useSession((state) => state.forgetUser)
  const [generalError, setGeneralError] = useState<string | null>(null)

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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Abriendo tu vault…' : 'Desbloquear'}
        </Button>
      </form>

      {/*
        * The emergency exit goes here and not only in the login, because this is the
        * place where somebody discovers they cannot remember: they already know who
        * they are, what they do not recall is the password.
        */}
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/recover" className="underline underline-offset-4 hover:text-foreground">
          He olvidado mi contraseña maestra
        </Link>
      </p>

      {/*
        * An explicit way out for the shared computer and for whoever has two accounts.
        * Without this there would be no way to remove the remembered email, and the
        * link in the footer would lead to the login with the previous account still
        * stored.
        */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => {
          forgetUser()
          navigate('/login', { replace: true })
        }}
      >
        Olvidar esta cuenta en este dispositivo
      </Button>
    </AuthLayout>
  )
}
