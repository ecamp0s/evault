import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { esquemaRegistro, registrar, type DatosRegistro } from '@/lib/auth'
import { ErrorDeApi } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { BannerDeError } from './BannerDeError'
import { mensajeGeneral, textoDeCampo } from './errores'

const CAMPOS_DEL_FORMULARIO = ['name', 'email', 'password'] as const

export function Register() {
  const navegar = useNavigate()
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosRegistro>({
    resolver: zodResolver(esquemaRegistro),
    defaultValues: { name: '', email: '', password: '', passwordConfirmation: '' },
  })

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)

    try {
      await registrar(datos)
      navegar('/', { replace: true })
    } catch (error) {
      if (!(error instanceof ErrorDeApi)) {
        throw error
      }

      setErrorGeneral(mensajeGeneral(error))

      for (const campo of Object.keys(error.erroresPorCampo)) {
        if ((CAMPOS_DEL_FORMULARIO as readonly string[]).includes(campo)) {
          setError(campo as (typeof CAMPOS_DEL_FORMULARIO)[number], {
            message: textoDeCampo(campo),
          })
        }
      }
    }
  })

  return (
    <AuthLayout
      titulo="Crea tu vault"
      descripcion="Empieza a guardar tus contraseñas de forma segura."
      pie={{ texto: '¿Ya tienes cuenta?', enlace: { a: '/login', texto: 'Entra' } }}
    >
      <BannerDeError mensaje={errorGeneral} />

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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthLayout>
  )
}
