import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { logIn, loginSchema, type LoginData } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { DecryptionError } from '@/lib/vault/crypto'
import { VaultUnreachable } from '@/lib/vault/unlock'
import { AuthLayout } from './AuthLayout'
import { ErrorBanner } from './ErrorBanner'
import { CANNOT_OPEN_VAULT, generalMessage, fieldMessage } from './errors'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [generalError, setGeneralError] = useState<string | null>(null)

  // If the guard evicted from a protected route, people go back to it after signing in
  // instead of always landing on the home page.
  const state = location.state as { from?: string; recovered?: boolean } | null
  const target = state?.from ?? '/'

  /*
   * Whoever lands here from recovery is, by definition, at the likeliest moment for
   * something to have gone wrong — see #309. Both keys are read out of the same cast
   * on purpose: the router state is untyped, and two casts drift apart in silence.
   */
  const justRecovered = state?.recovered === true

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const submit = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await logIn(data)
      navigate(target, { replace: true })
    } catch (error) {
      /*
       * Signing in and opening the vault are two steps, and they fail for different
       * reasons the interface cannot mix. With bad credentials, the user types them
       * again; with a vault that does not open, the server has already said the password
       * was right and there is nothing to retype.
       */
      if (error instanceof DecryptionError || error instanceof VaultUnreachable) {
        setGeneralError(CANNOT_OPEN_VAULT)

        return
      }

      if (!(error instanceof ApiError)) {
        throw error
      }

      setGeneralError(generalMessage(error))

      for (const field of Object.keys(error.fieldErrors)) {
        if (field === 'email' || field === 'password') {
          setError(field, { message: fieldMessage(field) })
        }
      }
    }
  })

  return (
    <AuthLayout
      title="Entra en tu vault"
      description="Accede con tu correo y tu contraseña."
      footer={{ text: '¿Aún no tienes cuenta?', link: { to: '/register', text: 'Crea una' } }}
    >
      <ErrorBanner message={generalError} />

      {justRecovered && (
        <Notice className="mb-4">
          Entra con tu contraseña nueva. Y ten en cuenta que{' '}
          <strong>tu clave de recuperación sigue siendo la misma</strong>: recuperar la
          cuenta no la invalida. Si crees que alguien más la tiene, genera una nueva desde
          «Clave de recuperación».
        </Notice>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          {errors.email && <FieldError>{errors.email.message}</FieldError>}
        </Field>

        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          {errors.password && <FieldError>{errors.password.message}</FieldError>}
        </Field>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {/* Covers both steps, and the second is the slow one: deriving the key */}
          {isSubmitting ? 'Abriendo tu vault…' : 'Entrar'}
        </Button>

        {/* Understated on purpose: it is the emergency exit, not an alternative to
            signing in. But it has to be here, because here is where somebody finds
            out they cannot remember their master password. */}
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/recover" className="underline underline-offset-4 hover:text-foreground">
            He olvidado mi contraseña maestra
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
