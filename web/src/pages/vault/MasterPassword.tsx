import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AppLayout } from '@/components/app/AppLayout'
import { useSession } from '@/lib/session'
import { DecryptionError } from '@/lib/vault/crypto'
import { changeMasterPassword } from '@/lib/vault/masterPassword'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

type ChangeData = z.infer<typeof schema>

/**
 * Cambiar la contraseña maestra. Ver ADR-008.
 *
 * La pantalla puede permitirse ser sencilla porque la operación lo es: no recifra
 * nada, así que no hay progreso que enseñar ni riesgo de dejar la vault a medias.
 * Eso es exactamente lo que compró aquel ADR.
 */
export function MasterPassword() {
  const navegar = useNavigate()
  const user = useSession((estado) => estado.user)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangeData>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', password: '', passwordConfirmation: '' },
  })

  const enviar = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await changeMasterPassword(user?.email ?? '', data.currentPassword, data.password)

      /*
       * El mensaje de éxito se pone DESPUÉS de que el servidor haya confirmado.
       * Decirlo antes y que la petición falle dejaría al usuario creyendo que su
       * contraseña es una que no es, y a la siguiente sesión pensando que ha perdido
       * la vault. Es la familia de fallos que la Iteración 3 documentó como «la
       * interfaz haciendo algo distinto de lo que dice».
       */
      setHecho(true)
    } catch (error) {
      setGeneralError(
        error instanceof DecryptionError
          ? 'Esa no es tu contraseña actual. Vuelve a escribirla.'
          : 'No hemos podido cambiar tu contraseña. Inténtalo de nuevo.',
      )
    }
  })

  if (hecho) {
    return (
      <AppLayout title="Contraseña maestra">
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-sm font-medium">Contraseña cambiada.</p>
          <p className="text-sm text-muted-foreground">
            Tus entradas siguen donde estaban: no ha hecho falta volver a cifrarlas, solo
            cambiar con qué se abre la llave que las descifra.
          </p>
          <p className="text-sm text-muted-foreground">
            Las sesiones que tuvieras abiertas en otros dispositivos se han cerrado. Esta
            sigue abierta.
          </p>
          <div>
            <Button type="button" onClick={() => void navegar('/')}>
              Volver a la vault
            </Button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Contraseña maestra">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Cambiarla es inmediato por muy grande que sea tu vault: tus entradas no se
          vuelven a cifrar, solo cambia la llave que las abre.
        </p>

        {/*
          * Va contra la intuición y por eso se dice aquí, donde importa: quien cambia
          * la contraseña sospechando que se la han robado suele creer que con eso
          * corta todos los accesos, y con la clave de recuperación no es así. Ver
          * ADR-010.
          */}
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Si tienes clave de recuperación, <strong>seguirá funcionando</strong> después de
          cambiar la contraseña. Si crees que alguien pudo hacerse con ella, genera una
          nueva desde «Clave de recuperación».
        </p>

        <form onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="currentPassword">Contraseña actual</FieldLabel>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.currentPassword ? true : undefined}
              {...register('currentPassword')}
            />
            {errors.currentPassword && <FieldError>{errors.currentPassword.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Contraseña nueva</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="passwordConfirmation">Repite la nueva</FieldLabel>
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

          {/*
            * El mismo aviso que el registro, y por el mismo motivo: sigue sin haber
            * forma de recuperar una contraseña maestra olvidada salvo la clave de
            * recuperación. Elegir una nueva es volver a elegir el secreto del que
            * cuelga todo.
            */}
          <p className="text-sm text-muted-foreground">
            Si olvidas la nueva, solo podrás volver a entrar con tu clave de recuperación.
            No podemos restablecerla.
          </p>

          {generalError && (
            <p role="alert" className="text-sm text-destructive">
              {generalError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? 'Cambiándola…' : 'Cambiar la contraseña'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void navegar('/')}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
