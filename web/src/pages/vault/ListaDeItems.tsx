import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useItems, useVaultActivo } from '@/lib/vault/hooks'
import type { Item } from '@/lib/vault/tipos'
import { Cargando, ErrorAlCargar, SinItems } from './EstadosDeLaLista'
import { DialogoDeItem } from './DialogoDeItem'
import { FilaDeItem } from './FilaDeItem'

/**
 * La lista de credenciales guardadas.
 *
 * Encadena dos consultas: primero cuál es el vault activo, y solo entonces sus
 * items. Es consecuencia de que el contexto de tenant viaje explícito y no en
 * sesión (ADR-004): el cliente no puede pedir items hasta saber de qué vault.
 *
 * Esa cadena es también la razón de que los estados se traten a la vez para las
 * dos consultas. Si se miraran por separado, entre que responde la de vaults y
 * arranca la de items habría un instante con la primera resuelta y la segunda sin
 * empezar, y la interfaz enseñaría el estado vacío durante un parpadeo: le diría
 * al usuario que su vault no tiene nada justo antes de pintarle sus contraseñas.
 */
export function ListaDeItems() {
  const vault = useVaultActivo()
  const items = useItems(vault.data?.id)

  /*
   * null cerrado; 'nuevo' creando; un item, editándolo. Un solo estado en vez de
   * un booleano más el item, para que no pueda existir la combinación imposible de
   * «cerrado pero con item» ni «abierto sin saber qué».
   */
  const [edicion, setEdicion] = useState<Item | 'nuevo' | null>(null)

  if (vault.isError || items.isError) {
    return (
      <ErrorAlCargar
        onReintentar={() => {
          void (vault.isError ? vault.refetch() : items.refetch())
        }}
      />
    )
  }

  // La de items aún no ha arrancado mientras no haya vault, así que su isPending
  // por sí solo no distingue «esperando al vault» de «cargando de verdad».
  if (vault.isPending || !vault.data || items.isPending) {
    return <Cargando />
  }

  const vaultId = vault.data.id

  return (
    <>
      {items.data.length === 0 ? (
        <SinItems onCrear={() => setEdicion('nuevo')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEdicion('nuevo')}>
              <Plus className="size-4" aria-hidden="true" />
              Nueva entrada
            </Button>
          </div>

          <ul className="space-y-2" aria-label="Credenciales guardadas">
            {items.data.map((item) => (
              <FilaDeItem key={item.id} item={item} onEditar={() => setEdicion(item)} />
            ))}
          </ul>
        </div>
      )}

      {/*
        * Se monta solo cuando hay algo que editar, y con key por entrada: así el
        * formulario nace con sus valores en vez de resincronizarse con un efecto,
        * y abrir una entrada tras otra no puede enseñar los datos de la anterior.
        */}
      {edicion !== null && (
        <DialogoDeItem
          key={edicion === 'nuevo' ? 'nuevo' : edicion.id}
          vaultId={vaultId}
          item={edicion === 'nuevo' ? null : edicion}
          onCerrar={() => setEdicion(null)}
        />
      )}
    </>
  )
}
