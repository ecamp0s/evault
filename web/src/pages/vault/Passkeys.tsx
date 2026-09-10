import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AppLayout } from '@/components/app/AppLayout'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { useSession } from '@/lib/session'
import { queryKeys } from '@/lib/vault/queryKeys'
import { DecryptionError } from '@/lib/vault/crypto'
import { PasskeyUnsupported } from '@/lib/vault/passkey'
import {
  type AccountPasskey,
  addPasskey,
  listPasskeys,
  revokePasskey,
} from '@/lib/vault/passkeyAccount'

const schema = z.object({
  label: z.string().min(1, 'Ponle un nombre para reconocerlo'),
  password: z.string().min(1, 'Escribe tu contraseña maestra'),
})

type AddData = z.infer<typeof schema>

/**
 * Where somebody adds and removes the passkeys that open their vault. See ADR-021.
 *
 * A PAGE AND NOT A SWITCH, for the reason `ADR-019` §6.4 gave the offline cache and
 * that applies harder here: this opens a third way into the vault, and a toggle with a
 * four-word label would be asking somebody to consent to something nobody described.
 *
 * WHAT THE TEXT HAS TO SAY, in the order #498 arrived at — use, mechanics, cost,
 * instruction:
 *
 * - what it buys, which is not having to type a long password forty times a day;
 * - that the master password stays the main way in and this never replaces it;
 * - the cost, said plainly: whoever can pass this device's Face ID opens the vault
 *   WITHOUT knowing the master password;
 * - and that the label is read by the server, because `ADR-021` §5.2 accepts that and
 *   the screen must not imply otherwise.
 *
 * AND THE ONE THAT IS EASY TO LEAVE OUT: which hostname each passkey belongs to. A
 * passkey is scoped to the name it was registered under (#578), so somebody coming in
 * by the other name sees a list that does not contain theirs. Without this column the
 * application cannot explain that, and «it disappeared» is the worst thing a vault can
 * say.
 */
/**
 * When a passkey was last used, in Spanish.
 *
 * `es-ES` SPELLED OUT AND NOT `toLocaleDateString()` ON ITS OWN, which is what this was
 * first written as. Without a locale the browser picks, and a browser set to English
 * renders 9 October as «9/10/2026» — a date that in an otherwise Spanish screen reads
 * as 9 September and is wrong by a month without looking wrong. Caught by looking at the
 * page in a real browser, which is exactly what no test in this file could have done.
 *
 * The same choice OfflineNotice already made, so there is one way of writing a date in
 * the application rather than two.
 */
function formatUsedAt(usedAt: string): string {
  const date = new Date(usedAt)

  // An unreadable date is not worth a broken sentence: what matters is that it has been
  // used at all, which is what tells this passkey apart from an abandoned one.
  if (Number.isNaN(date.getTime())) return 'una fecha que no se ha podido leer'

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function Passkeys() {
  const user = useSession((state) => state.user)

  const [generalError, setGeneralError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<AccountPasskey | null>(null)

  /*
   * Through TanStack Query like every other read in the project, and not with a
   * useEffect that sets state. It is not only idiom: the cache is what makes the list
   * refresh after adding or revoking without this screen inventing its own plumbing.
   */
  const queryClient = useQueryClient()
  const { data: passkeys, isPending, isError } = useQuery<AccountPasskey[]>({
    queryKey: queryKeys.passkeys(),
    queryFn: listPasskeys,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.passkeys() })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddData>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', password: '' },
  })

  const add = handleSubmit(async (data) => {
    setGeneralError(null)

    try {
      await addPasskey(user?.email ?? '', data.password, data.label)
      reset()
      await refresh()
    } catch (error) {
      /*
       * Three failures that deserve three different sentences, because what the person
       * can do about each is not the same.
       *
       * A wrong master password is worth retyping. A browser without PRF is not — there
       * is nothing to try again, and #563 owns that text. And a cancelled dialog is not
       * a failure at all: somebody changed their mind, and telling them so would be the
       * application arguing with them.
       */
      if (error instanceof DOMException && error.name === 'NotAllowedError') return

      setGeneralError(
        error instanceof DecryptionError
          ? 'Esa no es tu contraseña maestra. Vuelve a escribirla.'
          : error instanceof PasskeyUnsupported
            ? 'Este navegador no puede crear un passkey para eVault.'
            : 'No hemos podido añadir el passkey. Inténtalo de nuevo.',
      )
    }
  })

  const revoke = async (passkey: AccountPasskey) => {
    setConfirming(null)
    setGeneralError(null)

    try {
      await revokePasskey(passkey.id)
      await refresh()
    } catch {
      setGeneralError('No hemos podido quitar el passkey. Inténtalo de nuevo.')
    }
  }

  return (
    <AppLayout title="Passkeys">
      <div className="flex max-w-xl flex-col gap-4">
        {/* What it buys goes first, which is the order #498 arrived at. */}
        <p className="text-sm">
          Con un passkey puedes{' '}
          <strong>abrir tu vault con tu cara o tu huella</strong>, sin escribir la
          contraseña maestra cada vez.
        </p>

        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tu contraseña maestra sigue siendo la
          principal.</strong>{' '}
          Un passkey es un atajo: puedes quitarlo cuando quieras y todo sigue
          funcionando igual que antes.
        </p>

        {/*
          * The cost, said where the decision is made. It is the same rule ADR-010
          * imposed for the recovery key and that the offline screen follows: a real
          * disclosure next to what is gained, not in a document afterwards.
          */}
        <Notice>
          A cambio, quien pueda desbloquear este dispositivo con su cara o su huella
          abre tu vault <strong>sin saber tu contraseña maestra</strong>.
          <strong className="mt-2 block">
            Añádelo solo en dispositivos que sean tuyos. Si pierdes uno, quítalo desde
            aquí.
          </strong>
        </Notice>

        {isError && (
          <p role="alert" className="text-sm text-destructive">
            No hemos podido leer tus passkeys. Recarga la página.
          </p>
        )}

        {generalError && (
          <p role="alert" className="text-sm text-destructive">
            {generalError}
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {isPending
              ? 'Buscando tus passkeys…'
              : passkeys?.length
                ? 'Tus passkeys'
                : 'No tienes ningún passkey todavía.'}
          </h2>

          {passkeys?.map((passkey) => (
            <div
              key={passkey.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{passkey.label}</span>
                <span className="text-xs text-muted-foreground">
                  Funciona entrando por {passkey.rp_id}
                </span>
                <span className="text-xs text-muted-foreground">
                  {passkey.last_used_at
                    ? `Usado por última vez el ${formatUsedAt(passkey.last_used_at)}`
                    : 'Todavía sin usar'}
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(passkey)}
              >
                Quitar
              </Button>
            </div>
          ))}

          {/*
            * The confirmation says what stops working, and says it in the same breath as
            * what still does. A warning with no «and then this» leaves somebody holding
            * an alarm they cannot act on — the lesson of Iteration 14.
            */}
          {confirming && (
            <div role="alertdialog" aria-label="Confirmar" className="rounded-md border p-3">
              <p className="text-sm">
                <strong>{confirming.label}</strong> dejará de abrir tu vault ahora mismo.
                Podrás seguir entrando con tu contraseña maestra, y volver a añadirlo
                cuando quieras.
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" onClick={() => void revoke(confirming)}>
                  Quitar el passkey
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(null)}
                >
                  Dejarlo como está
                </Button>
              </div>
            </div>
          )}
        </section>

        <form onSubmit={(event) => void add(event)} className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Añadir un passkey a este dispositivo</h2>

          <Field>
            <FieldLabel htmlFor="label">Nombre</FieldLabel>
            <Input id="label" autoComplete="off" {...register('label')} />
            {/*
              * ADR-021 §5.2 accepts that the label is metadata in the clear, and the
              * screen says so instead of implying it is private.
              */}
            <p className="text-xs text-muted-foreground">
              Para reconocerlo en esta lista. Es el único dato de tu passkey que el
              servidor puede leer.
            </p>
            {errors.label && <FieldError>{errors.label.message}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Contraseña maestra</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {/*
              * Why it is asked for, said rather than left as unexplained friction: the
              * wrapper is made by opening the one that already exists, and that takes
              * the master key.
              */}
            <p className="text-xs text-muted-foreground">
              Hace falta para darle acceso a tu vault al passkey.
            </p>
            {errors.password && <FieldError>{errors.password.message}</FieldError>}
          </Field>

          <Button type="submit" className="self-start" disabled={isSubmitting}>
            {isSubmitting ? 'Añadiendo…' : 'Añadir passkey'}
          </Button>
        </form>
      </div>
    </AppLayout>
  )
}
