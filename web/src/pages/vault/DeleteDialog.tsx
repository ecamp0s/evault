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
import { OfflineWrite } from '@/lib/vault/api'
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
 * Since #707 deleting sends the entry to the bin, where it stays thirty days and can be
 * restored as it was (ADR-018 §2.4). The confirmation stays anyway, and explicit: a
 * deletion is still discovered late, and the dialog saying **which** entry is going and
 * **where** is what lets somebody find it again. The button that deletes is still the
 * destructive one and not the one holding focus on opening.
 *
 * «Un mes» and not a date: the exact one comes from the server with the bin's list, and
 * the bin screen shows it. Repeating the thirty days here as a number would be a second
 * place to forget when they change.
 */
export function DeleteDialog({ vaultId, item, onClose }: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteItem(vaultId)

  const confirmDelete = async () => {
    setError(null)

    try {
      await remove.mutateAsync(item.id)

      toast.success(`«${item.content.name}» está en la papelera.`)
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }

      /*
       * The dialog does not close: were it to close, the user would see their entry
       * still in the list without knowing whether the deletion happened or not.
       */
      /*
       * `OfflineWrite` says something a network message cannot: retrying will not help
       * until the session reconnects. All three keep the reassurance that matters when a
       * deletion fails — the entry is still there.
       */
      setError(
        error instanceof OfflineWrite
          ? 'Estás viendo la copia guardada en este dispositivo. Vuelve a conectar para borrar. La entrada sigue guardada.'
          : error.isNetwork
            ? 'No hemos podido conectar. La entrada sigue guardada.'
            : 'No se ha podido borrar. La entrada sigue guardada.',
      )
    }
  }

  return (
    <Dialog open onOpenChange={(value) => !value && !remove.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Borrar «{item.content.name}»</DialogTitle>
          <DialogDescription>
            Irá a la papelera. Podrás restaurarla desde allí durante un mes; después se
            borrará del todo.
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
