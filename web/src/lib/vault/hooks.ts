import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { actualizarItem, borrarItem, crearItem, listarItems, listarVaults } from '@/lib/vault/api'
import { claves } from '@/lib/vault/claves'
import type { ContenidoDeItem, Item, Vault } from '@/lib/vault/tipos'

/**
 * Lo que usan las pantallas.
 *
 * Ninguna pantalla importa axios, ni conoce una URL, ni sabe qué hay que
 * invalidar después de guardar. Eso vive aquí, para que las cuatro pantallas del
 * sprint no repitan la misma fontanería con cuatro criterios distintos.
 */

export function useVaults() {
  return useQuery<Vault[]>({
    queryKey: claves.vaults(),
    /*
     * Envuelto y no pasado por referencia: listarVaults admite un token opcional
     * para el desbloqueo del login, y TanStack Query llama a queryFn con su propio
     * contexto como primer argumento, que no es un token.
     */
    queryFn: () => listarVaults(),
  })
}

/**
 * El vault personal, que en la Iteración 2 es el único que hay.
 *
 * Se deriva del listado en vez de pedirse aparte para que comparta caché: son la
 * misma consulta vista de dos maneras. Cuando existan las vaults compartidas, esto
 * seguirá valiendo como «el vault por defecto».
 */
export function useVaultPersonal() {
  const consulta = useVaults()

  return {
    ...consulta,
    data: consulta.data?.find((vault) => vault.is_personal) ?? null,
  }
}

/**
 * El vault sobre el que opera la interfaz ahora mismo.
 *
 * En la Iteración 2 es siempre el personal, porque no hay otro. Existe como
 * concepto aparte para que el día que haya selector de vault se cambie aquí y no
 * en cada pantalla.
 *
 * Ese estado es del cliente y no del servidor: la API es stateless y no guarda
 * ningún contexto activo. Ver ADR-004. Tampoco hace falta un store: la respuesta
 * ya vive en la caché de la consulta, y duplicarla en zustand crearía una segunda
 * fuente de verdad que podría desincronizarse.
 */
export function useVaultActivo() {
  return useVaultPersonal()
}

/**
 * Los items de un vault.
 *
 * Sin vaultId no se lanza la petición: al arrancar, la pantalla todavía no sabe
 * sobre qué vault opera porque el listado de vaults aún está en vuelo.
 */
export function useItems(vaultId: string | null | undefined) {
  return useQuery<Item[]>({
    queryKey: claves.items(vaultId ?? ''),
    queryFn: () => listarItems(vaultId ?? ''),
    enabled: Boolean(vaultId),
  })
}

export function useCrearItem(vaultId: string) {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: (contenido: ContenidoDeItem) => crearItem(vaultId, contenido),
    onSuccess: () => cliente.invalidateQueries({ queryKey: claves.items(vaultId) }),
  })
}

export function useActualizarItem(vaultId: string) {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: ({ itemId, contenido }: { itemId: string; contenido: ContenidoDeItem }) =>
      actualizarItem(vaultId, itemId, contenido),
    onSuccess: () => cliente.invalidateQueries({ queryKey: claves.items(vaultId) }),
  })
}

export function useBorrarItem(vaultId: string) {
  const cliente = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) => borrarItem(vaultId, itemId),
    onSuccess: () => cliente.invalidateQueries({ queryKey: claves.items(vaultId) }),
  })
}
