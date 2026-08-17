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
import { changeEmail } from '@/lib/vault/email'
import type { GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'

const schema = z
  .object({
    email: z.email('Escribe un correo válido'),
    emailConfirmation: z.string(),
    password: z.string().min(1, 'Escribe tu contraseña maestra'),
  })
  .refine((data) => data.email === data.emailConfirmation, {
    message: 'Los correos no coinciden',
    path: ['emailConfirmation'],
  })

type ChangeData = z.infer<typeof schema>

/**
 * Cambiar el correo electrónico. Ver ADR-014.
 *
 * Pide el correo DOS VECES, al contrario que el registro, y no es celo: no hay
 * verificación por email en el proyecto, así que un correo mal escrito aquí cambia el
 * salt de la derivación a algo que el usuario no recuerda haber escrito. Escribirlo
 * dos veces es la única red que queda. Es la consecuencia 4 de ADR-014.
 */
export function Email() {
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const updateEmail = useSession((state) => state.updateEmail)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<GeneratedRecoveryKey | null>(null)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangeData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', emailConfirmation: '', password: '' },
  })

  const submit = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      const generated = await changeEmail(
        user?.email ?? '',
        data.email,
        data.password,
        user?.has_recovery_key ?? false,
      )

      /*
       * Después de que el servidor confirme, nunca antes. Decirlo antes y que la
       * petición falle dejaría al usuario creyendo que su correo es uno que no es, y
       * como el correo es el salt, a la siguiente sesión pensando que ha perdido la
       * vault.
       */
      updateEmail(data.email)
      setRecoveryKey(generated)
      setDone(true)
    } catch (error) {
      setGeneralError(
        error instanceof DecryptionError
          ? 'Esa no es tu contraseña maestra. Vuelve a escribirla.'
          : 'No hemos podido cambiar tu correo. Inténtalo de nuevo.',
      )
    }
  })

  if (done) {
    return (
      <AppLayout title="Correo electrónico">
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-sm font-medium">Correo cambiado.</p>
          <p className="text-sm text-muted-foreground">
            A partir de ahora entras con <strong>{user?.email}</strong> y la misma contraseña
            maestra de siempre. Tus entradas siguen donde estaban.
          </p>
          <p className="text-sm text-muted-foreground">
            Las sesiones que tuvieras abiertas en otros dispositivos se han cerrado. Esta
            sigue abierta.
          </p>

          {/*
            * La clave nueva, para quien tenía una. Se enseña AQUÍ y no en otra
            * pantalla porque este es el único momento en que existe: si el usuario se
            * va sin copiarla, se queda sin ella y hay que generar otra.
            */}
          {recoveryKey && (
            <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">
                Tu clave de recuperación ha cambiado. Cópiala ahora.
              </p>
              <p
                className="rounded-md border bg-muted/50 p-3 font-mono text-sm break-all select-all"
                data-testid="recovery-key"
              >
                {recoveryKey.formatted}
              </p>
              <p className="text-sm text-muted-foreground">
                La anterior ha dejado de servir, porque tu correo formaba parte de ella.
                Guarda esta donde tenías la otra y destruye la vieja.
              </p>
            </div>
          )}

          <div>
            <Button type="button" onClick={() => void navigate('/')}>
              Volver a la vault
            </Button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Correo electrónico">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Tu correo no es solo tu nombre de usuario: forma parte de la llave que abre tu
          vault. Por eso cambiarlo pide la contraseña maestra, y por eso hay que
          escribirlo dos veces.
        </p>

        {/*
          * EL AVISO QUE NO PUEDE DESAPARECER, y va contra la intuición justamente
          * porque es lo contrario de lo que dice la pantalla de contraseña maestra:
          * allí la clave de recuperación SOBREVIVE al cambio y aquí NO. El motivo es
          * que el correo es el salt del que se derivan sus claves. Ver ADR-014.
          *
          * Hay un test que falla si este texto desaparece, igual que el del aviso
          * inverso: son dos frases que dicen lo contrario y ninguna puede caerse en un
          * refactor de textos.
          */}
        {user?.has_recovery_key && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            Tu clave de recuperación <strong>dejará de funcionar</strong> al cambiar el
            correo. Te daremos una nueva al terminar, y tendrás que guardarla en lugar de
            la anterior.
          </p>
        )}

        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="email">Correo nuevo</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="emailConfirmation">Repite el correo nuevo</FieldLabel>
            <Input
              id="emailConfirmation"
              type="email"
              autoComplete="email"
              aria-invalid={errors.emailConfirmation ? true : undefined}
              {...register('emailConfirmation')}
            />
            {errors.emailConfirmation && (
              <FieldError>{errors.emailConfirmation.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Contraseña maestra</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </Field>

          {generalError && (
            <p role="alert" className="text-sm text-destructive">
              {generalError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Cambiar correo
            </Button>
            <Button type="button" variant="outline" onClick={() => void navigate('/')}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
