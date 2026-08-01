import { api, interpretarError } from '@/lib/api'
import { desempaquetar, empaquetar } from '@/lib/vault/sinCifrar'
import type { ContenidoDeItem, Item, ItemCifrado, Vault } from '@/lib/vault/tipos'

/**
 * Las llamadas a la API de vaults.
 *
 * Es la única capa que conoce axios y las URLs. Las pantallas usan los hooks de
 * consultas.ts y no llegan hasta aquí, para que un cambio de rutas o de forma de
 * respuesta no se propague por toda la interfaz.
 *
 * Aquí también se cruza la frontera del blob: lo que sale hacia la API va
 * empaquetado y lo que entra viene desempaquetado, de modo que del resto de la
 * aplicación hacia dentro solo existen items legibles.
 */

function aItem(cifrado: ItemCifrado): Item {
  return {
    id: cifrado.id,
    vaultId: cifrado.vault_id,
    contenido: desempaquetar(cifrado),
    creadoEn: cifrado.created_at,
    actualizadoEn: cifrado.updated_at,
  }
}

export async function listarVaults(): Promise<Vault[]> {
  try {
    const { data } = await api.get<{ data: { vaults: Vault[] } }>('/vaults')

    return data.data.vaults
  } catch (error) {
    throw interpretarError(error)
  }
}

export async function listarItems(vaultId: string): Promise<Item[]> {
  try {
    const { data } = await api.get<{ data: { items: ItemCifrado[] } }>(
      `/vaults/${vaultId}/items`,
    )

    return data.data.items.map(aItem)
  } catch (error) {
    throw interpretarError(error)
  }
}

export async function crearItem(vaultId: string, contenido: ContenidoDeItem): Promise<Item> {
  try {
    const { data } = await api.post<{ data: { item: ItemCifrado } }>(
      `/vaults/${vaultId}/items`,
      empaquetar(contenido),
    )

    return aItem(data.data.item)
  } catch (error) {
    throw interpretarError(error)
  }
}

/*
 * Manda el payload entero aunque el verbo sea PATCH. Texto cifrado, nonce y
 * versión son un solo dato repartido en tres campos, y la API los exige juntos.
 */
export async function actualizarItem(
  vaultId: string,
  itemId: string,
  contenido: ContenidoDeItem,
): Promise<Item> {
  try {
    const { data } = await api.patch<{ data: { item: ItemCifrado } }>(
      `/vaults/${vaultId}/items/${itemId}`,
      empaquetar(contenido),
    )

    return aItem(data.data.item)
  } catch (error) {
    throw interpretarError(error)
  }
}

export async function borrarItem(vaultId: string, itemId: string): Promise<void> {
  try {
    await api.delete(`/vaults/${vaultId}/items/${itemId}`)
  } catch (error) {
    throw interpretarError(error)
  }
}
