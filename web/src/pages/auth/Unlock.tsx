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
 * Bloqueo de la vault, que es lo que ocurre al recargar desde que el token vive
 * solo en memoria.
 *
 * La diferencia con el login no es técnica sino de qué se le dice al usuario.
 * ADR-007 lo pide explícitamente: «La interfaz lo presenta como un bloqueo y no
 * como una expulsión: el usuario sigue siendo el mismo, lo que falta es la
 * contraseña maestra.» De ahí que no haya campo de correo, que se salude por el
 * nombre, y que el texto explique por qué ha pasado en vez de dar por hecho que se
 * entiende.
 *
 * Por debajo hace un login completo, pero eso es un detalle de implementación que
 * la interfaz no tiene por qué contar.
 */
export function Unlock() {
  const navegar = useNavigate()
  const location = useLocation()
  const rememberedUser = useSession((estado) => estado.rememberedUser)
  const olvidarUsuario = useSession((estado) => estado.forgetUser)
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

  const enviar = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await unlock(data.password)
      navegar(target, { replace: true })
    } catch (error) {
      if (error instanceof DecryptionError || error instanceof VaultUnreachable) {
        setGeneralError(CANNOT_OPEN_VAULT)

        return
      }

      if (!(error instanceof ApiError)) {
        throw error
      }

      /*
       * Un 401 aquí significa contraseña equivocada, no sesión caducada: no había
       * sesión que caducar. El texto de mensajeGeneral habla de correo y
       * contraseña, y aquí el correo no se ha escrito, así que se dice lo que
       * corresponde.
       */
      setGeneralError(
        error.esDeCredenciales ? 'Esa no es tu contraseña maestra.' : generalMessage(error),
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
      pie={{
        text: '¿No es tu cuenta?',
        link: { a: '/login', text: 'Entra con otra' },
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

      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
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
        * La salida de emergencia va aquí y no solo en el login, porque este es el
        * sitio donde alguien descubre que no se acuerda: ya sabe quién es, lo que
        * no recuerda es la contraseña.
        */}
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/recuperar" className="underline underline-offset-4 hover:text-foreground">
          He olvidado mi contraseña maestra
        </Link>
      </p>

      {/*
        * Salida explícita para el ordenador compartido y para quien tenga dos
        * cuentas. Sin esto, el correo recordado no habría forma de quitarlo, y el
        * link del pie llevaría al login con la cuenta anterior todavía guardada.
        */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => {
          olvidarUsuario()
          navegar('/login', { replace: true })
        }}
      >
        Olvidar esta cuenta en este dispositivo
      </Button>
    </AuthLayout>
  )
}
