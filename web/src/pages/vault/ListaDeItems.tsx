import { useItems, useVaultActivo } from '@/lib/vault/hooks'
import { Cargando, ErrorAlCargar, SinItems } from './EstadosDeLaLista'
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

  if (items.data.length === 0) {
    return <SinItems />
  }

  return (
    <ul className="space-y-2" aria-label="Credenciales guardadas">
      {items.data.map((item) => (
        <FilaDeItem key={item.id} item={item} />
      ))}
    </ul>
  )
}
