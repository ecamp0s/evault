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
  /** El item que se edita, o null para crear uno nuevo. */
  item: Item | null
  onClose: () => void
}

/**
 * Crear y editar, en la misma pantalla.
 *
 * Es un diálogo y no una ruta por una razón concreta: el aviso de cambios sin
 * guardar. useBlocker de react-router solo funciona con un data router, y esta
 * aplicación monta BrowserRouter; migrar el router entero para conseguir un aviso
 * sería mucho más cambio del que este issue pide. En un diálogo, en cambio, todas
 * las salidas —Escape, clic fuera, botón de cancelar— pasan por aquí y se pueden
 * interceptar sin depender del router.
 *
 * Se monta solo mientras está abierto, y quien lo monta le pone una key distinta
 * por entrada. Así los valores iniciales del formulario se calculan una vez al
 * montar, en lugar de resincronizarse con un efecto cada vez que cambia el item
 * que toca editar. Es la forma que React recomienda para «reiniciar el estado
 * cuando cambian las props», y de paso evita el fallo clásico de abrir una entrada
 * y ver por un instante los datos de la anterior.
 */
export function ItemDialog({ vaultId, item, onClose }: ItemDialogProps) {
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
   * Recargar o cerrar la pestaña con cambios sin guardar. El navegador enseña su
   * propio mensaje y no deja personalizarlo, así que basta con marcar el evento.
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
       * El formulario no se toca: lo escrito sigue ahí para poder reintentar. Es
       * criterio explícito del issue, y perder una contraseña recién tecleada por
       * un fallo de red sería de las cosas más molestas que puede hacer esta
       * pantalla.
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
              <ItemFields register={register} errors={errors} watch={watch} setValue={setValue} />
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
