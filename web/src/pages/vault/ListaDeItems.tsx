import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { salir } from '@/lib/auth'
import { useItems, useVaultActivo } from '@/lib/vault/hooks'
import { VaultBloqueada } from '@/lib/vault/claveEnMemoria'
import type { Item } from '@/lib/vault/tipos'
import { Cargando, ErrorAlCargar, SinItems, VaultCerrada } from './EstadosDeLaLista'
import { DialogoDeBorrado } from './DialogoDeBorrado'
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

  // Aparte del de edición: borrar no es un modo de editar, y mezclarlos obligaría
  // a distinguir después con qué intención se abrió la misma entrada.
  const [borrando, setBorrando] = useState<Item | null>(null)

  /*
   * La vault bloqueada va antes que el error genérico, y no es un orden cualquiera:
   * llega como fallo de la consulta igual que una red caída, pero no lo es. Sin esta
   * rama, la pantalla invitaría a comprobar la conexión cuando la conexión está
   * perfectamente y lo que falta es la contraseña maestra.
   */
  if (vault.error instanceof VaultBloqueada || items.error instanceof VaultBloqueada) {
    /*
     * Solo se cierra la sesión, sin navegar. Es el patrón que ya usa el interceptor
     * de 401 en lib/sesion.ts: vaciar el store basta, porque el guard reacciona al
     * cambio y lleva al login. Navegar desde aquí ataría esta pantalla al router
     * sin ganar nada.
     */
    return <VaultCerrada onVolverAEntrar={() => void salir()} />
  }

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
              <FilaDeItem
                key={item.id}
                item={item}
                onEditar={() => setEdicion(item)}
                onBorrar={() => setBorrando(item)}
              />
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

      {borrando !== null && (
        <DialogoDeBorrado
          key={borrando.id}
          vaultId={vaultId}
          item={borrando}
          onCerrar={() => setBorrando(null)}
        />
      )}
    </>
  )
}
