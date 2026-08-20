import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { useDeleteItem } from '@/lib/vault/hooks'
import type { Item } from '@/lib/vault/types'

interface DeleteDialogProps {
  vaultId: string
  item: Item
  onClose: () => void
}

/**
 * Deletion confirmation.
 *
 * Deleting here is graver than in most applications: there is no bin, there is no copy
 * and a deleted password is not reconstructed from memory. Hence the confirmation being
 * explicit, the dialog saying **which** entry is about to be deleted instead of a
 * generic «are you sure?», and the button that deletes being the destructive one and not
 * the one holding focus on opening.
 *
 * The warning that there is no way back is literal and not rhetorical: until a bin
 * exists, there is none.
 */
export function DeleteDialog({ vaultId, item, onClose }: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteItem(vaultId)

  const confirmDelete = async () => {
    setError(null)

    try {
      await remove.mutateAsync(item.id)

      toast.success(`Se ha borrado «${item.content.nombre}».`)
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }

      /*
       * The dialog does not close: were it to close, the user would see their entry
       * still in the list without knowing whether the deletion happened or not.
       */
      setError(
        error.isNetwork
          ? 'No hemos podido conectar. La entrada sigue guardada.'
          : 'No se ha podido borrar. La entrada sigue guardada.',
      )
    }
  }

  return (
    <Dialog open onOpenChange={(value) => !value && !remove.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Borrar «{item.content.nombre}»</DialogTitle>
          <DialogDescription>
            Se borrará de forma permanente. No hay papelera, así que esto no tiene vuelta
            atrás.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {remove.isPending ? 'Borrando…' : 'Borrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
