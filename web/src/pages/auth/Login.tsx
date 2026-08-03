import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { logIn, loginSchema, type LoginData } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { DecryptionError } from '@/lib/vault/crypto'
import { VaultUnreachable } from '@/lib/vault/unlock'
import { AuthLayout } from './AuthLayout'
import { BannerDeError } from './BannerDeError'
import { NO_SE_PUEDE_ABRIR_LA_VAULT, mensajeGeneral, textoDeCampo } from './errores'

export function Login() {
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  // Si el guard expulsó desde una ruta protegida, se vuelve a ella tras entrar en
  // vez de aterrizar siempre en la portada.
  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/'

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)

    try {
      await logIn(datos)
      navegar(destino, { replace: true })
    } catch (error) {
      /*
       * Entrar y abrir la vault son dos pasos, y fallan por motivos distintos que
       * la interfaz no puede mezclar. Con las credenciales mal, el usuario vuelve a
       * escribirlas; con la vault que no abre, el servidor ya ha dicho que la
       * contraseña era la correcta y no hay nada que reescribir.
       */
      if (error instanceof DecryptionError || error instanceof VaultUnreachable) {
        setErrorGeneral(NO_SE_PUEDE_ABRIR_LA_VAULT)

        return
      }

      if (!(error instanceof ApiError)) {
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
          {/* Cubre los dos pasos, y el segundo es el que tarda: derivar la clave */}
          {isSubmitting ? 'Abriendo tu vault…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  )
}
