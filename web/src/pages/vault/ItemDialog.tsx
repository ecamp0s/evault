import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { useUpdateItem, useCreateItem } from '@/lib/vault/hooks'
import { EMPTY_ITEM, toContent, toFormData, itemSchema, type ItemFormData } from '@/lib/vault/schema'
import type { Item } from '@/lib/vault/types'
import { useUnsavedWorkWhile } from '@/lib/vault/unsavedWork'
import { ItemFields } from './ItemFields'

interface ItemDialogProps {
  vaultId: string
  /** The item being edited, or null to create a new one. */
  item: Item | null
  /**
   * Every tag already used in the vault, so the editor can suggest instead of letting
   * people invent a second spelling of one they already have.
   *
   * It comes down from the list because that is where the decrypted items are. There is
   * no endpoint to ask: the server cannot read them.
   */
  tagsInUse: string[]
  onClose: () => void
}

/**
 * Creating and editing, on the same screen.
 *
 * It is a dialog and not a route for a concrete reason: the unsaved-changes warning.
 * react-router's useBlocker only works with a data router, and this application mounts
 * BrowserRouter; migrating the whole router to get a warning would be far more change
 * than this issue asks for. In a dialog, on the other hand, every way out — Escape, a
 * click outside, the cancel button — goes through here and can be intercepted without
 * depending on the router.
 *
 * It is mounted only while it is open, and whoever mounts it gives it a different key
 * per entry. That way the form's initial values are computed once on mounting, instead
 * of being resynchronised with an effect every time the item to edit changes. It is the
 * shape React recommends for «resetting the state when the props change», and it also
 * avoids the classic failure of opening one entry and seeing the previous one's data
 * for an instant.
 */
export function ItemDialog({ vaultId, item, tagsInUse, onClose }: ItemDialogProps) {
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const create = useCreateItem(vaultId)
  const update = useUpdateItem(vaultId)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: item ? toFormData(item.content) : EMPTY_ITEM,
  })

  /*
   * Auto-lock does not ask before discarding this, and it should not — see #303.
   * Declaring the unsaved work is what lets its warning say what is about to be
   * lost, out of the same flag that already guards the exits below.
   */
  useUnsavedWorkWhile(isDirty)

  /*
   * Reloading or closing the tab with unsaved changes. The browser shows its own message
   * and does not allow customising it, so marking the event is enough.
   */
  useEffect(() => {
    if (!isDirty) {
      return
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()

    window.addEventListener('beforeunload', warnBeforeUnload)

    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty])

  function requestClose() {
    if (isDirty && !isSubmitting) {
      setConfirmingDiscard(true)

      return
    }

    onClose()
  }

  const submit = handleSubmit(async (data) => {
    setGeneralError(null)

    const content = toContent(data)

    try {
      if (item) {
        await update.mutateAsync({ itemId: item.id, content: content })
      } else {
        await create.mutateAsync(content)
      }

      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }

      /*
       * The form is not touched: what was typed stays there so it can be retried. It is
       * an explicit criterion of the issue, and losing a freshly typed password over a
       * network failure would be among the most annoying things this screen can do.
       */
      setGeneralError(
        error.isNetwork
          ? 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.'
          : 'No se ha podido guardar. Inténtalo de nuevo.',
      )
    }
  })

  return (
    <Dialog open onOpenChange={(value) => !value && requestClose()}>
      <DialogContent className="sm:max-w-lg">
        {confirmingDiscard ? (
          <>
            <DialogHeader>
              <DialogTitle>Tienes cambios sin guardar</DialogTitle>
              <DialogDescription>
                Si sales ahora se perderá lo que has escrito.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmingDiscard(false)}>
                Seguir editando
              </Button>
              <Button variant="destructive" onClick={onClose}>
                Descartar cambios
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>{item ? 'Editar entrada' : 'Nueva entrada'}</DialogTitle>
              <DialogDescription>
                Solo el nombre es obligatorio. El resto puedes rellenarlo cuando quieras.
              </DialogDescription>
            </DialogHeader>

            {generalError && (
              <p
                role="alert"
                className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {generalError}
              </p>
            )}

            <div className="my-4">
              <ItemFields
                register={register}
                errors={errors}
                watch={watch}
                setValue={setValue}
                tagsInUse={tagsInUse}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {isSubmitting ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
