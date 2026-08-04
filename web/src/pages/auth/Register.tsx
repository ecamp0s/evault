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

const CAMPOS_DEL_FORMULARIO = ['name', 'email', 'password'] as const

/**
 * El aviso que ADR-001 exige literalmente: comunicar de forma inequívoca que no hay
 * recuperación **antes** de que el usuario cree su vault.
 *
 * No es un texto legal ni una advertencia de cortesía. Hasta ahora una contraseña
 * olvidada era un problema de soporte; desde el cifrado real es la pérdida
 * definitiva de los datos, y nadie —tampoco quien opera el servicio— puede
 * deshacerla. Decirlo después de que el usuario haya guardado sus contraseñas sería
 * decirlo tarde.
 *
 * Va antes del botón y no al pie en letra pequeña, y explica el porqué en vez de
 * solo advertir: que no se pueda recuperar es la consecuencia directa de que nadie
 * más pueda leerla, y entendido así deja de parecer una carencia del producto.
 *
 * Tiene test propio, por la regla que salió de la Iteración 2: cuando la interfaz
 * hace una promesa sobre seguridad, se escribe el test que falla si la promesa deja
 * de ser cierta. Aquí la promesa es el aviso, y el test falla si desaparece.
 */
function AvisoSinRecuperacion() {
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
  const navegar = useNavigate()
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

  const enviar = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await signUp(data)
      navegar('/', { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }

      setGeneralError(generalMessage(error))

      for (const field of Object.keys(error.erroresPorCampo)) {
        if ((CAMPOS_DEL_FORMULARIO as readonly string[]).includes(field)) {
          setError(field as (typeof CAMPOS_DEL_FORMULARIO)[number], {
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
      pie={{ text: '¿Ya tienes cuenta?', link: { a: '/login', text: 'Entra' } }}
    >
      <ErrorBanner message={generalError} />

      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
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

        <AvisoSinRecuperacion />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Protegiendo tu vault…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthLayout>
  )
}
