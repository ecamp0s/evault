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
import { ErrorDeApi } from '@/lib/api'
import { useActualizarItem, useCrearItem } from '@/lib/vault/hooks'
import { ITEM_VACIO, aContenido, aFormulario, esquemaItem, type DatosItem } from '@/lib/vault/esquema'
import type { Item } from '@/lib/vault/tipos'
import { CamposDeItem } from './CamposDeItem'

interface DialogoDeItemProps {
  vaultId: string
  /** El item que se edita, o null para crear uno nuevo. */
  item: Item | null
  onCerrar: () => void
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
export function DialogoDeItem({ vaultId, item, onCerrar }: DialogoDeItemProps) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)

  const crear = useCrearItem(vaultId)
  const actualizar = useActualizarItem(vaultId)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<DatosItem>({
    resolver: zodResolver(esquemaItem),
    defaultValues: item ? aFormulario(item.contenido) : ITEM_VACIO,
  })

  /*
   * Recargar o cerrar la pestaña con cambios sin guardar. El navegador enseña su
   * propio mensaje y no deja personalizarlo, así que basta con marcar el evento.
   */
  useEffect(() => {
    if (!isDirty) {
      return
    }

    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault()

    window.addEventListener('beforeunload', avisar)

    return () => window.removeEventListener('beforeunload', avisar)
  }, [isDirty])

  function intentarCerrar() {
    if (isDirty && !isSubmitting) {
      setConfirmandoDescarte(true)

      return
    }

    onCerrar()
  }

  const enviar = handleSubmit(async (datos) => {
    setErrorGeneral(null)

    const contenido = aContenido(datos)

    try {
      if (item) {
        await actualizar.mutateAsync({ itemId: item.id, contenido })
      } else {
        await crear.mutateAsync(contenido)
      }

      onCerrar()
    } catch (error) {
      if (!(error instanceof ErrorDeApi)) {
        throw error
      }

      /*
       * El formulario no se toca: lo escrito sigue ahí para poder reintentar. Es
       * criterio explícito del issue, y perder una contraseña recién tecleada por
       * un fallo de red sería de las cosas más molestas que puede hacer esta
       * pantalla.
       */
      setErrorGeneral(
        error.esDeRed
          ? 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.'
          : 'No se ha podido guardar. Inténtalo de nuevo.',
      )
    }
  })

  return (
    <Dialog open onOpenChange={(valor) => !valor && intentarCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {confirmandoDescarte ? (
          <>
            <DialogHeader>
              <DialogTitle>Tienes cambios sin guardar</DialogTitle>
              <DialogDescription>
                Si sales ahora se perderá lo que has escrito.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmandoDescarte(false)}>
                Seguir editando
              </Button>
              <Button variant="destructive" onClick={onCerrar}>
                Descartar cambios
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={enviar} noValidate>
            <DialogHeader>
              <DialogTitle>{item ? 'Editar entrada' : 'Nueva entrada'}</DialogTitle>
              <DialogDescription>
                Solo el nombre es obligatorio. El resto puedes rellenarlo cuando quieras.
              </DialogDescription>
            </DialogHeader>

            {errorGeneral && (
              <p
                role="alert"
                className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {errorGeneral}
              </p>
            )}

            <div className="my-4">
              <CamposDeItem register={register} errors={errors} watch={watch} setValue={setValue} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={intentarCerrar}>
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
