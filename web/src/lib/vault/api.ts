import { api, interpretError } from '@/lib/api'
import { unpack, pack } from '@/lib/vault/payload'
import { vaultKeyOrFail } from '@/lib/vault/keyInMemory'
import type { ItemContent, Item, EncryptedItem, Vault } from '@/lib/vault/types'

/**
 * Las llamadas a la API de vaults.
 *
 * Es la única capa que conoce axios y las URLs. Las pantallas usan los hooks de
 * consultas.ts y no llegan hasta aquí, para que un cambio de rutas o de forma de
 * respuesta no se propague por toda la interfaz.
 *
 * Aquí también se cruza la frontera del cifrado: lo que sale hacia la API va
 * cifrado y lo que entra viene descifrado, de modo que del resto de la aplicación
 * hacia dentro solo existen items legibles y hacia fuera solo bytes opacos. Ninguna
 * pantalla ve nunca un ciphertext, y ninguna toca una CryptoKey.
 */

async function aItem(key: CryptoKey, encrypted: EncryptedItem): Promise<Item> {
  return {
    id: encrypted.id,
    vaultId: encrypted.vault_id,
    content: await unpack(key, encrypted),
    createdAt: encrypted.created_at,
    updatedAt: encrypted.updated_at,
  }
}

/**
 * Los vaults del usuario, con la clave envuelta de cada uno.
 *
 * Admite un token explícito para el único caso en que hace falta: el desbloqueo
 * durante el login, que ocurre **antes** de publicar la sesión en el store. El
 * interceptor lee el token de allí, así que sin este parámetro esa petición saldría
 * sin autenticar. Ver el comentario de entrar() en lib/auth.ts sobre por qué la
 * sesión no se publica hasta que la vault está abierta.
 */
export async function listarVaults(token?: string): Promise<Vault[]> {
  try {
    const { data } = await api.get<{ data: { vaults: Vault[] } }>('/vaults', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    return data.data.vaults
  } catch (error) {
    throw interpretError(error)
  }
}

export async function listarItems(vaultId: string): Promise<Item[]> {
  /*
   * La clave se pide una vez para toda la lista y no una por fila. Aparte de ser
   * más barato, así el estado de la vault se decide en un solo momento: si estuviera
   * bloqueada, esto falla antes de devolver una lista a medias.
   */
  const key = vaultKeyOrFail()

  let encryptedBytes: EncryptedItem[]

  try {
    const { data } = await api.get<{ data: { items: EncryptedItem[] } }>(
      `/vaults/${vaultId}/items`,
    )

    encryptedBytes = data.data.items
  } catch (error) {
    throw interpretError(error)
  }

  /*
   * El descifrado va fuera del try, y no es un descuido: interpretarError traduce
   * errores de axios, y un fallo criptográfico no es uno. Meterlo dentro lo
   * disfrazaría de problema de red.
   */
  return Promise.all(encryptedBytes.map((encrypted) => aItem(key, encrypted)))
}

export async function crearItem(vaultId: string, content: ItemContent): Promise<Item> {
  const key = vaultKeyOrFail()
  const payload = await pack(key, content)

  try {
    const { data } = await api.post<{ data: { item: EncryptedItem } }>(
      `/vaults/${vaultId}/items`,
      payload,
    )

    return await aItem(key, data.data.item)
  } catch (error) {
    throw interpretError(error)
  }
}

/*
 * Manda el payload entero aunque el verbo sea PATCH. Texto cifrado, nonce y
 * versión son un solo dato repartido en tres campos, y la API los exige juntos.
 */
export async function actualizarItem(
  vaultId: string,
  itemId: string,
  content: ItemContent,
): Promise<Item> {
  const key = vaultKeyOrFail()

  /*
   * Se cifra antes de la petición, a propósito. Si el cifrado fallara después de
   * mandar nada, o a medias, la fila quedaría escrita con un payload que no se
   * puede abrir. Aquí, un fallo al cifrar deja el item anterior intacto en el
   * servidor, que es el criterio del issue: nunca escribir datos corruptos encima
   * de los buenos.
   */
  const payload = await pack(key, content)

  try {
    const { data } = await api.patch<{ data: { item: EncryptedItem } }>(
      `/vaults/${vaultId}/items/${itemId}`,
      payload,
    )

    return await aItem(key, data.data.item)
  } catch (error) {
    throw interpretError(error)
  }
}

export async function borrarItem(vaultId: string, itemId: string): Promise<void> {
  try {
    await api.delete(`/vaults/${vaultId}/items/${itemId}`)
  } catch (error) {
    throw interpretError(error)
  }
}
