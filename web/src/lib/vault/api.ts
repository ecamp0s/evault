import { ApiError, api, interpretError } from '@/lib/api'
import { unpack, pack } from '@/lib/vault/payload'
import { vaultKeyOrFail } from '@/lib/vault/keyInMemory'
import { cacheItems, cacheVaultKey, readCachedAccount } from '@/lib/vault/deviceCache'
import { offlineCacheEnabled } from '@/lib/vault/offlinePreference'
import { useSession } from '@/lib/session'
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
 *
 * AND IT IS THE ONLY PLACE THE OFFLINE CACHE CAN BE WRITTEN FROM, which is not where it
 * looks like it belongs. The layer above deals in decrypted items, and what ADR-019
 * says to keep on the device is the ciphertext: by the time the hooks see the data, the
 * thing that had to be stored no longer exists. See `deviceCache.ts`.
 */

/**
 * Keeps on this device what was just fetched, if this device was asked to.
 *
 * NOTHING IN HERE MAY BREAK A REQUEST. It is deliberately fire-and-forget: the caller
 * has already got its data, and failing to cache it is not a reason to fail the read
 * that produced it. The cache is a convenience; the vault is not.
 */
function keepForOffline(work: (email: string) => Promise<unknown>): void {
  if (!offlineCacheEnabled()) return

  const email = useSession.getState().user?.email

  if (!email) return

  void work(email).catch(() => {
    // deviceCache already swallows its own failures; this covers the unforeseen.
  })
}

/**
 * Writing was attempted while this session is reading the copy on this device.
 *
 * IT EXTENDS `ApiError` ON PURPOSE, so every screen that already handles one keeps
 * working unchanged: the dialogs preserve what was typed and show a message instead of
 * crashing. What the extra type buys is the chance to say WHY, which «no hemos podido
 * conectar» does not — the connection is not the whole story, the session is.
 */
export class OfflineWrite extends ApiError {
  constructor() {
    super(null, {}, 'La sesión está leyendo la copia de este dispositivo, así que no puede escribir')
    this.name = 'OfflineWrite'
  }
}

/**
 * Refuses a write before it becomes a request. See ADR-019 §4.
 *
 * IT IS REFUSED HERE AND NOT IN THE SCREENS, and that is the point: there is one place
 * where every write passes, so there is one place that cannot be forgotten. A guard in
 * each dialog would be three guards, and the fourth screen to write something would have
 * none.
 *
 * AND IT FAILS BEFORE SENDING ANYTHING. An offline session has no token, so the request
 * would come back 401 — which is a worse failure than this one: it looks like a
 * credentials problem, and on a flaky network it would be indistinguishable from a
 * session that really did expire.
 */
function refuseWhileOffline(): void {
  if (useSession.getState().offline) {
    throw new OfflineWrite()
  }
}

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
/**
 * The account this device is showing, when there is no server to ask.
 *
 * Returns null when the session is not an offline one, so the ordinary path is
 * untouched: online, none of this runs.
 */
async function offlineAccount() {
  const { offline, rememberedUser } = useSession.getState()

  if (!offline || !rememberedUser) return null

  return readCachedAccount(rememberedUser.email)
}

export async function listVaults(token?: string): Promise<Vault[]> {
  /*
   * Rebuilt from what was cached rather than asked for. Only the id and the wrapped key
   * were stored, because they are the only two this layer uses; `name`, `is_personal`
   * and `role` are filled in with the one shape this application has ever had — a
   * single personal vault whose owner you are.
   *
   * THEY ARE MADE UP, AND THAT IS ONLY ACCEPTABLE WHILE NOTHING PAINTS THEM. Nothing
   * does today: checked across `pages/` and `components/`. The day a vault picker
   * arrives, these three stop being harmless and have to come from the cache like the
   * other two — and the day a vault has a name on screen, this would be showing a
   * different one without failing at anything.
   */
  const cached = await offlineAccount()

  if (cached) {
    return [
      {
        id: cached.vault.id,
        name: 'Personal',
        is_personal: true,
        role: 'owner',
        wrapped_key: cached.vault.wrappedKey,
        wrapped_key_iv: cached.vault.wrappedKeyIv,
      },
    ]
  }

  try {
    const { data } = await api.get<{ data: { vaults: Vault[] } }>('/vaults', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    const vaults = data.data.vaults
    const personal = vaults.find((vault) => vault.is_personal)

    if (personal) keepForOffline((email) => cacheVaultKey(email, personal))

    return vaults
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

  /*
   * Offline, the ciphertext comes from the device and is decrypted right here, with the
   * same key and the same `toItem` as anything that arrived over the network. There is
   * no second decryption path — the bytes are the same bytes.
   */
  const cached = await offlineAccount()

  if (cached) {
    return Promise.all(cached.items.map((encrypted) => toItem(key, encrypted)))
  }

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
   * Before decrypting, and that is the point: what is kept is exactly what arrived.
   * Caching after `toItem` would mean having decrypted content in hand at the moment
   * of writing to disk, which is the mistake this is arranged to make impossible.
   */
  keepForOffline((email) => cacheItems(email, encryptedBytes))

  /*
   * Decryption sits outside the try, and that is not an oversight: interpretarError
   * translates axios errors, and a cryptographic failure is not one. Moving it inside
   * would disguise it as a network problem.
   */
  return Promise.all(encryptedBytes.map((encrypted) => toItem(key, encrypted)))
}

export async function createItem(vaultId: string, content: ItemContent): Promise<Item> {
  refuseWhileOffline()

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
  refuseWhileOffline()

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
  refuseWhileOffline()

  try {
    await api.delete(`/vaults/${vaultId}/items/${itemId}`)
  } catch (error) {
    throw interpretError(error)
  }
}
