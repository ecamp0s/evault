import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { Check, Download, Loader2, Printer, ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AppLayout } from '@/components/app/AppLayout'
import { useSession } from '@/lib/session'
import { DecryptionError } from '@/lib/vault/crypto'
import { createRecoveryKey } from '@/lib/vault/recovery'
import { copyValue } from '@/lib/vault/copy'
import { useUnsavedWorkWhile } from '@/lib/vault/unsavedWork'
import type { GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'

const schema = z.object({
  password: z.string().min(1, 'Escribe tu contraseña maestra'),
})

type ConfirmData = z.infer<typeof schema>

/**
 * Generating and handing over the recovery key. See ADR-010.
 *
 * The screen has two states and the order matters: first the master password is asked
 * for, and only then does the key exist. Generating it before the user has proven they
 * can open their vault would leave a secret on screen that may be of no use to them.
 *
 * What is shown is shown ONCE. It is stored nowhere it can be recovered from, neither
 * here nor on the server, so whoever closes this page without copying it has to generate
 * another. That has to be said beforehand, not on closing.
 *
 * THE KEY IS REGISTERED BEFORE IT IS SHOWN, AND THAT STAYS. Decided on 26 August 2026
 * closing #329, and written here rather than left implicit, because the order has a
 * consequence that is easy to miss: from the moment this screen paints the key, the
 * account already says it has one. Lose the screen and what is left is an account
 * claiming a plan B whose only readable copy nobody kept.
 *
 * The alternative was considered and turned down: not registering until the box is
 * ticked. It would close one more case — closing the tab, which no warning can reach —
 * but it opens a symmetrical one, somebody who copies the key and never confirms, left
 * holding a key the server does not know. And it would contradict `ADR-010`, so it
 * needs an ADR of its own rather than a quiet change here.
 *
 * WHAT WAS DONE INSTEAD is make the loss impossible to miss while it is happening: this
 * screen declares itself to the inactivity warning, which then names the key instead of
 * talking about a lost draft, and says to generate another. The remaining hole is
 * stated rather than papered over — **closing the tab or a browser crash still leave
 * the account claiming a key nobody has**, and nothing here warns of that.
 */
export function RecoveryKey() {
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const [generated, setGenerated] = useState<GeneratedRecoveryKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmData>({
    resolver: zodResolver(schema),
    defaultValues: { password: '' },
  })

  /*
   * From the moment the key is on screen until its owner ticks the box. See #329.
   *
   * WHAT MAKES THIS DIFFERENT FROM #303, and why it is worth a kind of its own: this
   * is not unsaved work. `createRecoveryKey` has ALREADY sent the wrapper and the hash
   * to the server, so the account already says it has a recovery key. If locking takes
   * this screen away, what is left is an account that claims a plan B whose only
   * readable copy nobody kept — and its owner finds out on the day they need it.
   *
   * The tick is the right condition and not `generated !== null` on its own: once they
   * have confirmed keeping it, there is nothing on this screen left to lose.
   */
  useUnsavedWorkWhile(generated !== null && !saved, 'clave-de-recuperacion')

  const generate = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      setGenerated(await createRecoveryKey(user?.email ?? '', data.password))
    } catch (error) {
      /*
       * A decryption failure here means exactly one thing: the master password is not
       * the one that wrapped this vault. Saying so avoids the generic «it could not be
       * done», which would leave the user not knowing what to retry.
       */
      setGeneralError(
        error instanceof DecryptionError
          ? 'Esa no es tu contraseña maestra. Vuelve a escribirla.'
          : 'No hemos podido crear la clave de recuperación. Inténtalo de nuevo.',
      )
    }
  })

  const download = () => {
    if (!generated) return

    const blob = new Blob(
      [
        'Clave de recuperación de eVault\n\n',
        `Cuenta: ${user?.email ?? ''}\n\n`,
        `${generated.formatted}\n\n`,
        'Quien tenga esta clave puede abrir tu vault sin tu contraseña maestra.\n',
        'Guárdala donde guardarías una llave, no donde guardas un apunte.\n',
      ],
      { type: 'text/plain' },
    )

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'evault-clave-de-recuperacion.txt'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  if (!generated) {
    return (
      <AppLayout title="Clave de recuperación">
        <div className="flex max-w-xl flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Es la única forma de volver a entrar si olvidas tu contraseña maestra. Sin
            ella no hay ninguna: nosotros no podemos abrir tu vault ni devolverte el
            acceso.
          </p>
          <p className="text-sm text-muted-foreground">
            Se genera en este dispositivo y solo se enseña una vez. Ten a mano dónde vas
            a guardarla antes de continuar.
          </p>

          <form onSubmit={(event) => void generate(event)} className="flex flex-col gap-4">
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
                {isSubmitting ? 'Creando la clave…' : 'Crear la clave'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void navigate('/')}>
                Ahora no
              </Button>
            </div>
          </form>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Clave de recuperación">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm font-medium">Cópiala ahora. No volverás a verla.</p>

        <p
          className="rounded-md border bg-muted/50 p-4 font-mono text-sm break-all select-all"
          data-testid="recovery-key"
        >
          {generated.formatted}
        </p>

        <p className="text-sm text-muted-foreground">
          Quien tenga esta clave puede abrir tu vault sin saber tu contraseña maestra.
          Guárdala donde guardarías una llave, no donde guardas un apunte.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyValue(generated.formatted.replace(/-/g, ''), 'Clave')}
          >
            Copiar
          </Button>
          <Button type="button" variant="outline" onClick={download}>
            <Download className="size-4" aria-hidden="true" />
            Descargar
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            Imprimir
          </Button>
        </div>

        {/* The confirmation is not a formality: it is what separates having a plan B
            from believing you have one. Hence the button to move on not existing until
            it is ticked. Since #329 it does one more thing — it is what tells the
            inactivity warning there is still something here to lose. */}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
            className="mt-1"
          />
          <span>La he guardado en un sitio del que puedo recuperarla</span>
        </label>

        <div>
          <Button type="button" disabled={!saved} onClick={() => void navigate('/')}>
            {saved ? <Check className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            Terminar
          </Button>
        </div>
      </div>
    </AppLayout>
  )
}
