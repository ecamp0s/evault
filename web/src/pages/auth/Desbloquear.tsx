import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router'
import { Loader2, Lock } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { desbloquear } from '@/lib/auth'
import { useSesion } from '@/lib/sesion'
import { ErrorDeApi } from '@/lib/api'
import { DecryptionError } from '@/lib/vault/crypto'
import { VaultUnreachable } from '@/lib/vault/unlock'
import { AuthLayout } from './AuthLayout'
import { BannerDeError } from './BannerDeError'
import { NO_SE_PUEDE_ABRIR_LA_VAULT, mensajeGeneral } from './errores'

const esquema = z.object({
  password: z.string().min(1, 'Escribe tu contraseña maestra'),
})

type DatosDesbloqueo = z.infer<typeof esquema>

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
export function Desbloquear() {
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const usuarioRecordado = useSesion((estado) => estado.usuarioRecordado)
  const olvidarUsuario = useSesion((estado) => estado.olvidarUsuario)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosDesbloqueo>({
    resolver: zodResolver(esquema),
    defaultValues: { password: '' },
  })

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)

    try {
      await desbloquear(datos.password)
      navegar(destino, { replace: true })
    } catch (error) {
      if (error instanceof DecryptionError || error instanceof VaultUnreachable) {
        setErrorGeneral(NO_SE_PUEDE_ABRIR_LA_VAULT)

        return
      }

      if (!(error instanceof ErrorDeApi)) {
        throw error
      }

      /*
       * Un 401 aquí significa contraseña equivocada, no sesión caducada: no había
       * sesión que caducar. El texto de mensajeGeneral habla de correo y
       * contraseña, y aquí el correo no se ha escrito, así que se dice lo que
       * corresponde.
       */
      setErrorGeneral(
        error.esDeCredenciales ? 'Esa no es tu contraseña maestra.' : mensajeGeneral(error),
      )
    }
  })

  return (
    <AuthLayout
      titulo="Tu vault está bloqueada"
      descripcion={
        usuarioRecordado
          ? `Introduce la contraseña maestra de ${usuarioRecordado.email} para volver a abrirla.`
          : 'Introduce tu contraseña maestra para volver a abrirla.'
      }
      pie={{
        texto: '¿No es tu cuenta?',
        enlace: { a: '/login', texto: 'Entra con otra' },
      }}
    >
      <BannerDeError mensaje={errorGeneral} />

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
        * Salida explícita para el ordenador compartido y para quien tenga dos
        * cuentas. Sin esto, el correo recordado no habría forma de quitarlo, y el
        * enlace del pie llevaría al login con la cuenta anterior todavía guardada.
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
