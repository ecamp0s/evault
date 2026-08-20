import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { registerSchema, signUp, type RegisterData } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { ErrorBanner } from './ErrorBanner'
import { generalMessage, fieldMessage } from './errors'

const FORM_FIELDS = ['name', 'email', 'password'] as const

/**
 * The warning ADR-001 demands literally: communicating unambiguously that there is no
 * recovery **before** the user creates their vault.
 *
 * It is not legal text and not a courtesy warning. Until now a forgotten password was a
 * support problem; since encryption became real it is the definitive loss of the data,
 * and nobody — not even whoever runs the service — can undo it. Saying it after the
 * user has stored their passwords would be saying it late.
 *
 * It goes before the button and not at the foot in small print, and it explains the why
 * instead of merely warning: that it cannot be recovered is the direct consequence of
 * nobody else being able to read it, and understood that way it stops looking like a
 * shortcoming of the product.
 *
 * It has a test of its own, by the rule that came out of Iteration 2: when the interface
 * makes a promise about security, the test that fails if the promise stops being true
 * gets written. Here the promise is the warning, and the test fails if it disappears.
 */
function NoRecoveryNotice() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">
          Si olvidas esta contraseña, perderás el acceso a todo lo que guardes.
        </span>{' '}
        No podemos recuperarla ni restablecerla, y eso es justamente lo que impide que
        nadie más —nosotros incluidos— pueda leer tu vault.
      </p>
    </div>
  )
}

export function Register() {
  const navigate = useNavigate()
  const [generalError, setGeneralError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', passwordConfirmation: '' },
  })

  const submit = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await signUp(data)
      navigate('/', { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }

      setGeneralError(generalMessage(error))

      for (const field of Object.keys(error.fieldErrors)) {
        if ((FORM_FIELDS as readonly string[]).includes(field)) {
          setError(field as (typeof FORM_FIELDS)[number], {
            message: fieldMessage(field),
          })
        }
      }
    }
  })

  return (
    <AuthLayout
      title="Crea tu vault"
      description="Empieza a guardar tus contraseñas de forma segura."
      footer={{ text: '¿Ya tienes cuenta?', link: { to: '/login', text: 'Entra' } }}
    >
      <ErrorBanner message={generalError} />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="name">Nombre</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            {...register('name')}
          />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </Field>

        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
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
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <FieldError>{errors.password.message}</FieldError>
          ) : (
            <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={errors.passwordConfirmation ? true : undefined}>
          <FieldLabel htmlFor="passwordConfirmation">Repite la contraseña</FieldLabel>
          <Input
            id="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.passwordConfirmation ? true : undefined}
            {...register('passwordConfirmation')}
          />
          {errors.passwordConfirmation && (
            <FieldError>{errors.passwordConfirmation.message}</FieldError>
          )}
        </Field>

        <NoRecoveryNotice />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Protegiendo tu vault…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthLayout>
  )
}
