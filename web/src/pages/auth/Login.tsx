import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { entrar, esquemaLogin, type DatosLogin } from '@/lib/auth'
import { ErrorDeApi } from '@/lib/api'
import { AuthLayout } from './AuthLayout'
import { BannerDeError } from './BannerDeError'
import { mensajeGeneral, textoDeCampo } from './errores'

export function Login() {
  const navegar = useNavigate()
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: '', password: '' },
  })

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)

    try {
      await entrar(datos)
      navegar('/', { replace: true })
    } catch (error) {
      if (!(error instanceof ErrorDeApi)) {
        throw error
      }

      setErrorGeneral(mensajeGeneral(error))

      for (const campo of Object.keys(error.erroresPorCampo)) {
        if (campo === 'email' || campo === 'password') {
          setError(campo, { message: textoDeCampo(campo) })
        }
      }
    }
  })

  return (
    <AuthLayout
      titulo="Entra en tu vault"
      descripcion="Accede con tu correo y tu contraseña."
      pie={{ texto: '¿Aún no tienes cuenta?', enlace: { a: '/register', texto: 'Crea una' } }}
    >
      <BannerDeError mensaje={errorGeneral} />

      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
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
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  )
}
