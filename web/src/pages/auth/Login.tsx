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

  // Si el guard expulsó desde una ruta protegida, se vuelve a ella tras entrar en
  // vez de aterrizar siempre en la portada.
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
       * Entrar y abrir la vault son dos pasos, y fallan por motivos distintos que
       * la interfaz no puede mezclar. Con las credenciales mal, el usuario vuelve a
       * escribirlas; con la vault que no abre, el servidor ya ha dicho que la
       * contraseña era la correcta y no hay nada que reescribir.
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
          {/* Cubre los dos pasos, y el segundo es el que tarda: derivar la clave */}
          {isSubmitting ? 'Abriendo tu vault…' : 'Entrar'}
        </Button>

        {/* Discreto a propósito: es la salida de emergencia, no una alternativa
            al login. Pero tiene que estar aquí, que es donde alguien descubre
            que no se acuerda de su contraseña maestra. */}
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/recuperar" className="underline underline-offset-4 hover:text-foreground">
            He olvidado mi contraseña maestra
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
