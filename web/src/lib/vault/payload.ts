import type { ItemContent, EncryptedItem, ItemPayload } from '@/lib/vault/types'
import { CIPHER_VERSION, encrypt, decrypt } from '@/lib/vault/crypto'

/**
 * The boundary of the blob: from readable content to what travels to the API, and back.
 *
 * It replaces sinCifrar.ts, which during Iteration 2 did this same job with base64
 * and no cryptography. That file carried the warning that it encrypted nothing; this
 * one no longer needs it, because it really does encrypt with AES-256-GCM under a key
 * the server does not have. It is the only point of the client that had to be touched
 * to go from one to the other, which was the promise of issue #54 and was kept.
 *
 * The key arrives as a parameter and is not looked up in here. It is the same
 * principle ADR-004 applies to the vault context on the server: the caller says which
 * key, so decrypting «with whichever one is around» is not a possibility.
 *
 * See ADR-001, ADR-008 and docs/architecture/FOUNDATION.md.
 */

/**
 * What is shown when an entry cannot be read.
 *
 * Losing one row is bad; losing the whole screen over one row is worse. It happens
 * with an item written by a newer client, with one encrypted under a different master
 * password, and with any left over from the previous encoding.
 */
export const UNREADABLE: ItemContent = { nombre: 'No se puede leer esta entrada' }

/**
 * Whether some content is the marker above and not something the user wrote.
 *
 * It exists so that whoever needs to count them — the export, which cannot quietly
 * take a backup down with it — does not have to compare the text by hand.
 *
 * It compares by IDENTITY and not by value, which is stricter than it looks necessary
 * and is deliberate: comparing the text, an item the user had named «No se puede leer
 * esta entrada» would fall out of its own backup without anyone noticing. Here, only
 * what left this module unreadable is unreadable. That is why the marker is exported:
 * whoever tests against it has to use this very object, not one that resembles it.
 */
export function isUnreadable(content: ItemContent): boolean {
  return content === UNREADABLE
}

/** Encrypts an item's content so it can be sent to the API. */
export async function pack(
  key: CryptoKey,
  content: ItemContent,
): Promise<ItemPayload> {
  const { data, iv } = await encrypt(key, JSON.stringify(content))

  return { ciphertext: data, iv, version: CIPHER_VERSION }
}

/**
 * Decrypts an item coming from the API.
 *
 * It does not propagate the failure, and here that is right even though crypto.ts
 * does the opposite: this is called once per row when painting the list, and one
 * broken entry cannot stop the rest from being seen. What **does** propagate its
 * errors is packing, because a silent failure there would write rubbish over good
 * data.
 *
 * The asymmetry is deliberate: reading a row wrong shows and can be investigated;
 * writing a row wrong does not show until it is needed, and by then there is nothing
 * to be done.
 */
export async function unpack(
  key: CryptoKey,
  item: EncryptedItem,
): Promise<ItemContent> {
  /*
   * The version is checked before anything is attempted. A version 1 item would
   * decrypt to rubbish under any key, because it was never encrypted, and AES-GCM
   * would not reject it on the tag: it simply is not ciphertext.
   */
  if (item.version !== CIPHER_VERSION) {
    return UNREADABLE
  }

  try {
    const content: unknown = JSON.parse(
      await decrypt(key, { data: item.ciphertext, iv: item.iv }),
    )

    if (typeof content !== 'object' || content === null) {
      return UNREADABLE
    }

    const { nombre, ...rest } = content as ItemContent

    return { nombre: typeof nombre === 'string' ? nombre : 'Sin nombre', ...rest }
  } catch {
    return UNREADABLE
  }
}
