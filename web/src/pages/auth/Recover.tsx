import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
 * Lo que se le dice al usuario según lo que esté mal escrito.
 *
 * Existe el mensaje concreto porque el genérico sería «no se puede abrir tu vault»,
 * que suena a que los datos están perdidos. Aquí casi siempre lo que pasa es que
 * falta un carácter, y eso tiene arreglo mirando el papel otra vez.
 */
const PROBLEM_MESSAGES: Record<RecoveryKeyProblem, string> = {
  longitud: 'La clave no está completa. Cópiala entera, incluidos todos los grupos.',
  caracteres: 'Hay algún carácter que no pertenece a la clave. Revisa si has confundido un uno con una ele.',
  comprobacion: 'La clave está mal copiada. Repásala: falla algún carácter.',
}

/**
 * Recuperar el acceso con la clave de recuperación. Ver ADR-010.
 *
 * Los tres pasos van en la misma pantalla y en el mismo envío a propósito: entrar
 * con la clave, abrir la vault y fijar una contraseña maestra nueva. Terminar antes
 * dejaría la cuenta dependiendo del papel, que es lo que se estaba intentando
 * arreglar.
 *
 * Al acabar no se queda dentro: se vuelve al login para entrar con la contraseña
 * nueva, que es lo que demuestra que se ha fijado de verdad y no que se cree
 * haberla fijado.
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
     * La clave se comprueba antes de mandar nada. Con el carácter de comprobación
     * se sabe aquí mismo que está mal copiada, y decirlo en el acto es mucho mejor
     * que gastar un intento del limitador para recibir un «no válida» que no
     * distingue entre estar mal escrita y no ser la suya.
     */
    const parsed = parseRecoveryKey(data.recoveryKey)

    if ('problem' in parsed) {
      setError('recoveryKey', { message: PROBLEM_MESSAGES[parsed.problem] })

      return
    }

    try {
      await recoverAccess(data.email, parsed.bytes, data.password)

      void navigate('/login', { replace: true })
    } catch (error) {
      if (error instanceof DecryptionError) {
        /*
         * El servidor aceptó la clave y aun así el envoltorio no abre. No es un
         * problema de credenciales y no sirve reescribir nada, así que el mensaje no
         * promete que reintentar arregle algo.
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
