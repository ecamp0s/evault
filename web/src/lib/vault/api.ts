import { api, interpretError } from '@/lib/api'
import { unpack, pack } from '@/lib/vault/payload'
import { vaultKeyOrFail } from '@/lib/vault/keyInMemory'
import type { ItemContent, Item, EncryptedItem, Vault } from '@/lib/vault/types'

/**
 * The calls into the vaults API.
 *
 * The only layer that knows about axios and URLs. The screens use the hooks in
 * consultas.ts and never reach in here, so that a change of routes or of response
 * shape does not ripple across the whole interface.
 *
 * This is also where the encryption boundary is crossed: what goes out to the API goes
 * encrypted and what comes in arrives decrypted, so that from the rest of the
 * application inwards only readable items exist, and outwards only opaque bytes. No
 * screen ever sees a ciphertext, and none touches a CryptoKey.
 */

async function toItem(key: CryptoKey, encrypted: EncryptedItem): Promise<Item> {
  return {
    id: encrypted.id,
    vaultId: encrypted.vault_id,
    content: await unpack(key, encrypted),
    createdAt: encrypted.created_at,
    updatedAt: encrypted.updated_at,
  }
}

/**
 * The user's vaults, each with its wrapped key.
 *
 * It takes an explicit token for the one case that needs it: unlocking during login,
 * which happens **before** the session is published to the store. The interceptor
 * reads the token from there, so without this parameter that request would go out
 * unauthenticated. See the comment on entrar() in lib/auth.ts about why the session is
 * not published until the vault is open.
 */
export async function listVaults(token?: string): Promise<Vault[]> {
  try {
    const { data } = await api.get<{ data: { vaults: Vault[] } }>('/vaults', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    return data.data.vaults
  } catch (error) {
    throw interpretError(error)
  }
}

export async function listItems(vaultId: string): Promise<Item[]> {
  /*
   * The key is asked for once for the whole list and not once per row. Beyond being
   * cheaper, it means the state of the vault is settled at a single moment: were it
   * locked, this fails before returning a half-built list.
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
   * Decryption sits outside the try, and that is not an oversight: interpretarError
   * translates axios errors, and a cryptographic failure is not one. Moving it inside
   * would disguise it as a network problem.
   */
  return Promise.all(encryptedBytes.map((encrypted) => toItem(key, encrypted)))
}

export async function createItem(vaultId: string, content: ItemContent): Promise<Item> {
  const key = vaultKeyOrFail()
  const payload = await pack(key, content)

  try {
    const { data } = await api.post<{ data: { item: EncryptedItem } }>(
      `/vaults/${vaultId}/items`,
      payload,
    )

    return await toItem(key, data.data.item)
  } catch (error) {
    throw interpretError(error)
  }
}

/*
 * It sends the whole payload even though the verb is PATCH. Ciphertext, nonce and
 * version are one datum spread across three fields, and the API demands them together.
 */
export async function updateItem(
  vaultId: string,
  itemId: string,
  content: ItemContent,
): Promise<Item> {
  const key = vaultKeyOrFail()

  /*
   * Encryption happens before the request, on purpose. If encryption failed after
   * anything had been sent, or halfway through, the row would end up written with a
   * payload that cannot be opened. Here, a failure to encrypt leaves the previous item
   * untouched on the server, which is the criterion of the issue: never write corrupt
   * data over good data.
   */
  const payload = await pack(key, content)

  try {
    const { data } = await api.patch<{ data: { item: EncryptedItem } }>(
      `/vaults/${vaultId}/items/${itemId}`,
      payload,
    )

    return await toItem(key, data.data.item)
  } catch (error) {
    throw interpretError(error)
  }
}

export async function deleteItem(vaultId: string, itemId: string): Promise<void> {
  try {
    await api.delete(`/vaults/${vaultId}/items/${itemId}`)
  } catch (error) {
    throw interpretError(error)
  }
}
