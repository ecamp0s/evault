/**
 * The contract of the vaults API, exactly as the server returns it.
 *
 * These types describe what travels over the wire. What the user sees lives inside
 * the blob and has a type of its own, ContenidoDeItem, which the server neither
 * knows nor can know. See docs/architecture/FOUNDATION.md.
 */

export interface Vault {
  id: string
  name: string
  is_personal: boolean
  role: 'owner'
  /**
   * The key that opens this vault, wrapped with the master key of whoever is asking.
   *
   * It travels here and not in the login response because it belongs to the vault
   * and not to the session: once shared vaults exist, each will bring its own. It is
   * also what let the contract of /api/auth stay unchanged. See ADR-008.
   */
  wrapped_key: string
  wrapped_key_iv: string
}

/**
 * An item as the server stores it: opaque bytes, their nonce, and the version of the
 * schema they were written under.
 *
 * There is no field carrying meaning, and that is not an omission: if the name or the
 * URL travelled in the clear, the server would know which services the user has an
 * account with.
 */
export interface EncryptedItem {
  id: string
  vault_id: string
  ciphertext: string
  iv: string
  version: number
  created_at: string | null
  updated_at: string | null
}

/** What is sent when creating or updating. The three fields always travel together. */
export interface ItemPayload {
  ciphertext: string
  iv: string
  version: number
}

/**
 * The real content of an entry, already decoded.
 *
 * Everything in here is what the server must never see. Adding a field to this
 * interface is free and needs no migration, because the server only stores the
 * serialised result; adding a column to the table, on the other hand, is a security
 * decision.
 *
 * THESE FIELD NAMES STAY IN SPANISH, AND IT IS NOT SOMETHING THE CONVERSION TO
 * ENGLISH FORGOT. They are not identifiers: they are **the format of the blob**. This
 * object is serialised with JSON.stringify and encrypted as it stands, so its keys are
 * what is written inside every item already saved. Renaming `nombre` to `name` would
 * leave everything in every vault unreadable, without the compiler saying a word and
 * with no way to repair it, because the server cannot read that data to migrate it.
 *
 * The contract is fixed in docs/architecture/FOUNDATION.md. If it ever has to change,
 * it is done by raising `version` and migrating item by item from the client, not with
 * a rename.
 */
export interface ItemContent {
  nombre: string
  usuario?: string
  password?: string
  url?: string
  notas?: string
  /**
   * Whether the entry is a favourite, which the list puts on top.
   *
   * `true` OR ABSENT, NEVER `false`, and that is the contract and not a style choice:
   * FOUNDATION.md says to omit the keys that are not filled in, and a boolean would add
   * a key saying «no» to every one of the 370 entries — bytes that get encrypted,
   * stored and downloaded on every load to carry no information.
   *
   * Unmarking therefore DELETES the key, it does not set it to false.
   *
   * The name is in Spanish because it belongs to the list above and not to the code:
   * these are the format of the blob. Adding an English one here would split the same
   * serialised object across two languages, which is worse than either.
   */
  favorito?: true
}

/** An item with its content already decoded, which is what the screens use. */
export interface Item {
  id: string
  vaultId: string
  content: ItemContent
  createdAt: string | null
  updatedAt: string | null
}
