import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { DecryptionError } from '@/lib/vault/crypto'
import { recoverAccess } from '@/lib/vault/recovery'
import { parseRecoveryKey, type RecoveryKeyProblem } from '@/lib/vault/recoveryKey'
import { AuthLayout } from './AuthLayout'
import { ErrorBanner } from './ErrorBanner'

const schema = z
  .object({
    email: z.string().min(1, 'Escribe tu correo'),
    recoveryKey: z.string().min(1, 'Escribe tu clave de recuperación'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  })

type RecoverData = z.infer<typeof schema>

/**
 * What the user is told depending on what is written wrong.
 *
 * The specific message exists because the generic one would be «your vault cannot be
 * opened», which sounds like the data is lost. Here what is almost always happening is
 * that a character is missing, and that is fixed by looking at the paper again.
 */
const PROBLEM_MESSAGES: Record<RecoveryKeyProblem, string> = {
  longitud: 'La clave no está completa. Cópiala entera, incluidos todos los grupos.',
  caracteres: 'Hay algún carácter que no pertenece a la clave. Revisa si has confundido un uno con una ele.',
  comprobacion: 'La clave está mal copiada. Repásala: falla algún carácter.',
}

/**
 * Recovering access with the recovery key. See ADR-010.
 *
 * The three steps go on the same screen and in the same submission on purpose: getting
 * in with the key, opening the vault and setting a new master password. Finishing
 * earlier would leave the account depending on the piece of paper, which is what was
 * being fixed.
 *
 * It does not stay inside at the end: it goes back to the login to get in with the new
 * password, which is what proves it was really set and not merely believed to be.
 */
export function Recover() {
  const navigate = useNavigate()
  const [generalError, setGeneralError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RecoverData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', recoveryKey: '', password: '', passwordConfirmation: '' },
  })

  const submit = handleSubmit(async (data) => {
    setGeneralError(null)

    /*
     * The key is checked before anything is sent. With the check character it is known
     * right here that it was copied wrong, and saying so on the spot beats spending an
     * attempt of the limiter to receive a «not valid» that does not tell being
     * mistyped from not being theirs.
     */
    const parsed = parseRecoveryKey(data.recoveryKey)

    if ('problem' in parsed) {
      setError('recoveryKey', { message: PROBLEM_MESSAGES[parsed.problem] })

      return
    }

    try {
      await recoverAccess(data.email, parsed.bytes, data.password)

      /*
       * Said again on the way out, because this is the moment it matters — see #309.
       * The notice below is read before anyone knows whether recovery will work; this
       * one lands on someone who has just got back in, which is by definition the
       * most likely moment for something to have gone wrong.
       */
      void navigate('/login', { replace: true, state: { recovered: true } })
    } catch (error) {
      if (error instanceof DecryptionError) {
        /*
         * The server accepted the key and the wrapper still does not open. It is not a
         * credentials problem and retyping anything is no use, so the message does not
         * promise that retrying fixes something.
         */
        setGeneralError(
          'Tu clave es correcta, pero no hemos podido abrir la vault con ella. Ponte en contacto antes de volver a intentarlo.',
        )

        return
      }

      setGeneralError(
        error instanceof ApiError && error.state === 429
          ? 'Demasiados intentos. Espera un rato antes de volver a probar.'
          : 'No hemos podido recuperar tu cuenta. Revisa el correo y la clave.',
      )
    }
  })

  return (
    <AuthLayout
      title="Recupera tu cuenta"
      description="Con tu clave de recuperación puedes volver a entrar y elegir una contraseña maestra nueva."
      footer={{ text: '¿Te has acordado?', link: { to: '/login', text: 'Entra' } }}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <ErrorBanner message={generalError} />

        {/*
          * Counter-intuitive, and `ADR-010` asked for it to be said where the action
          * happens rather than on a help page: recovering does NOT retire the key it
          * used. The recovery wrapper hangs off the vault key and not off the master
          * key, so recovering — which is a rotation — leaves it working. Only
          * regenerating replaces it. See #309.
          */}
        <Notice>
          La clave que uses aquí <strong>seguirá funcionando</strong> después. Recuperar tu
          cuenta no la invalida: si crees que alguien más la tiene, genera una nueva desde
          «Clave de recuperación» en cuanto entres.
        </Notice>

        <Field>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={errors.email ? true : undefined}
            {...register('email')}
          />
          {errors.email && <FieldError>{errors.email.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="recoveryKey">Clave de recuperación</FieldLabel>
          <Textarea
            id="recoveryKey"
            rows={3}
            className="font-mono"
            aria-invalid={errors.recoveryKey ? true : undefined}
            {...register('recoveryKey')}
          />
          {errors.recoveryKey && <FieldError>{errors.recoveryKey.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Contraseña maestra nueva</FieldLabel>
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

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Recuperando tu cuenta…' : 'Recuperar mi cuenta'}
        </Button>
      </form>
    </AuthLayout>
  )
}
