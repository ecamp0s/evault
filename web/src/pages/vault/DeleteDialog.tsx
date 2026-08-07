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
 * Confirmación de borrado.
 *
 * Borrar aquí es más grave que en la mayoría de aplicaciones: no hay papelera, no
 * hay copia y una contraseña borrada no se reconstruye de memoria. De ahí que la
 * confirmación sea explícita, que el diálogo diga **qué** entrada se va a borrar
 * en vez de un «¿estás seguro?» genérico, y que el botón que borra sea el
 * destructivo y no el que tiene el foco al abrir.
 *
 * El aviso de que no tiene vuelta atrás es literal y no retórico: hasta que exista
 * papelera, no la tiene.
 */
export function DeleteDialog({ vaultId, item, onClose }: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteItem(vaultId)

  const confirmar = async () => {
    setError(null)

    try {
      await remove.mutateAsync(item.id)

      toast.success(`Se ha borrado «${item.content.nombre}».`)
      onClose()
    } catch (problema) {
      if (!(problema instanceof ApiError)) {
        throw problema
      }

      /*
       * El diálogo no se cierra: si se cerrara, el usuario vería su entrada
       * seguir en la lista sin saber si el borrado ha ocurrido o no.
       */
      setError(
        problema.esDeRed
          ? 'No hemos podido conectar. La entrada sigue guardada.'
          : 'No se ha podido borrar. La entrada sigue guardada.',
      )
    }
  }

  return (
    <Dialog open onOpenChange={(valor) => !valor && !remove.isPending && onClose()}>
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
          <Button variant="destructive" onClick={confirmar} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {remove.isPending ? 'Borrando…' : 'Borrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
