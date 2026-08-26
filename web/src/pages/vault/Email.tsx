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
import { useUnsavedWorkWhile } from '@/lib/vault/unsavedWork'
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
 * Changing the email address. See ADR-014.
 *
 * It asks for the email TWICE, unlike the sign-up, and it is not fussiness: there is no
 * email verification in the project, so an email mistyped here changes the salt of the
 * derivation to something the user does not remember typing. Typing it twice is the
 * only net left. It is consequence 4 of ADR-014.
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

  /*
   * The same as the recovery key screen, and here it is WORSE. See #329.
   *
   * #329 filed this screen under «passwords half typed, probably not worth anything».
   * That was wrong, and looking is what showed it: changing the email regenerates the
   * recovery key, because the email is the salt its keys are derived from (ADR-014).
   * So by the time this is on screen the OLD key has already stopped working and the
   * new one is already registered — a lock here does not lose a draft, it leaves an
   * account whose only usable way back in was on a screen that vanished.
   *
   * There is no «I have saved it» tick here as there is on the other screen, so what is
   * declared is simply having the key in hand. It errs towards warning too often, which
   * is the right side to err on for this.
   */
  useUnsavedWorkWhile(recoveryKey !== null, 'recovery-key')

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
       * After the server confirms, never before. Saying it earlier and having the
       * request fail would leave the user believing their email is one it is not, and
       * since the email is the salt, on the next session thinking they have lost the
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
            * The new key, for whoever had one. It is shown HERE and not on another
            * screen because this is the only moment it exists: if the user leaves
            * without copying it, they go without and another has to be generated.
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
          * THE WARNING THAT CANNOT DISAPPEAR, and it runs against intuition precisely
          * because it is the opposite of what the master password screen says: there the
          * recovery key SURVIVES the change and here it does NOT. The reason is that the
          * email is the salt its keys are derived from. See ADR-014.
          *
          * There is a test that fails if this text disappears, as there is for the
          * inverse warning: they are two sentences saying opposite things and neither
          * can fall out in a refactor of texts.
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
