import type { EncryptedItem, Vault } from '@/lib/vault/types'

/**
 * The vault kept on this device so it can be read without a network. See ADR-019.
 *
 * WHAT IS STORED IS WHAT THE SERVER ALREADY HELD, and nothing else: `ciphertext`, `iv`
 * and `version` exactly as they arrived, plus the vault key **wrapped**. Nothing
 * decrypted touches the disk — not the content, not the vault key, not the derived
 * master key. `ADR-007` still rules: what gets persisted is what the server already
 * stored.
 *
 * WHY IT IS INDEXED BY EMAIL AND NOT BY USER ID, which looks like the obvious choice
 * and is the wrong one: on reload the session is gone —`ADR-007` again— and the only
 * thing this browser remembers about who was here is `rememberedUser`, which carries a
 * name and an email. There is no id to look up by at the moment the cache has to be
 * found, which is precisely when there is no network to ask for one.
 *
 * The email is already in `localStorage` for the same reason, so this adds nothing that
 * was not on the device already.
 *
 * WHAT §2 OF ADR-019 ASKS TO BE SAID OUT LOUD: caching the vault takes the rate
 * limiting out of the way. Guessing the master password against kastor goes through the
 * API and its limiter; against a local cache it goes through nothing. The project
 * accepted that same property in Iteration 4 for exported `.evault` files, and the
 * 600,000 PBKDF2 iterations were sized for it. What changes is the frequency, not the
 * nature — and it is why this is off by default.
 *
 * IT NEVER BREAKS THE APPLICATION. Every write returns whether it worked instead of
 * throwing, and every read answers `null` when it cannot. A device with no IndexedDB —a
 * private window, an older browser, jsdom— has to behave exactly like one that simply
 * never cached anything, because the cache is a convenience and the vault is not.
 */

/**
 * The database, and the object store inside it.
 *
 * THE NAMES ARE IN ENGLISH, like every other persisted one. See #476: they are not
 * identifiers but names of things kept in the user's browser, and the rule for those is
 * the one `CLAUDE.md` already applied to migration filenames — the ones already in use
 * are never renamed, and the new ones are written in English.
 */
const DATABASE = 'evault.cache'
const STORE = 'accounts'
const VERSION = 1

/** The vault key material, still wrapped, which is all that is needed to unwrap it. */
export interface CachedVault {
  id: string
  wrappedKey: string
  wrappedKeyIv: string
}

/** Everything this device keeps for one account. */
export interface CachedAccount {
  email: string
  vault: CachedVault
  items: EncryptedItem[]
  /** When it was written, so a screen can say how old what it is showing is. */
  savedAt: string
}

/** Whether this browser can cache at all. A private window frequently cannot. */
export function isCacheSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    // Some browsers throw on merely touching it when storage is blocked.
    return false
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'email' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)

    /*
     * No `onblocked` handler, and that is not an omission: it fires when another tab
     * holds a connection open against an upgrade, and with a single schema version
     * there is no upgrade to be blocked. The day `VERSION` moves, this needs one — and
     * a test that can reach it, which today would be unreachable code.
     */
  })
}

/**
 * Runs one transaction against the store and closes the connection, whatever happened.
 *
 * EVERY READ AND EVERY WRITE GOES THROUGH HERE, so there is exactly one place where a
 * transaction can fail and exactly one rejection. A first version had a second, parallel
 * path for the merging write, and the consequence was an `onabort` that nothing could
 * ever reach: two ways to reject means the one that never runs is error handling that is
 * believed rather than known.
 *
 * THERE ARE NO `onerror` HANDLERS ON THE REQUESTS, AND THAT IS NOT AN OVERSIGHT: a
 * request whose error event nobody cancels aborts its transaction, so `onabort` already
 * covers every way a request can fail — including the one no request reports, which is
 * `put` throwing on a value the browser refuses to store.
 */
async function runTransaction<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const database = await open()

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)

      transaction.onabort = () => reject(transaction.error)

      body(transaction.objectStore(STORE), resolve)
    })
  } finally {
    database.close()
  }
}

/** Reads what this device has for an account, or `null` if it has nothing usable. */
export async function readCachedAccount(email: string): Promise<CachedAccount | null> {
  if (!isCacheSupported()) return null

  try {
    const record = await runTransaction<CachedAccount | undefined>('readonly', (store, done) => {
      const request = store.get(email)

      request.onsuccess = () => done(request.result as CachedAccount | undefined)
    })

    /*
     * Both halves or nothing. A record with the key but no items, or the other way
     * round, cannot open anything — and answering it as a cache would turn «there is
     * nothing here» into a decryption failure further down.
     */
    if (!record?.vault || !record.items) return null

    return record
  } catch {
    /*
     * A cache that cannot be read is the same as no cache. Turning this into an error
     * would take a device with a corrupt database and make it a device that cannot open
     * its vault, which is the opposite of what this exists for.
     */
    return null
  }
}

/**
 * Reads a record, lets the caller change it, and writes it back — all in one
 * transaction.
 *
 * WHY MERGING AND NOT ONE WRITE: the two halves of what this cache needs arrive from
 * two different requests. `GET /vaults` brings the wrapped key and `GET /items` brings
 * the ciphertext, and neither call has the other's half to hand. Writing the whole
 * record from either one would mean each request erasing what the other had just
 * stored.
 *
 * The read and the write share a transaction so that two refreshes racing cannot
 * interleave into a record holding one account's key and another's items.
 */
async function mergeIntoRecord(
  email: string,
  change: (current: Partial<CachedAccount>) => Partial<CachedAccount>,
): Promise<boolean> {
  if (!isCacheSupported()) return false

  try {
    return await runTransaction<boolean>('readwrite', (store, done) => {
      const read = store.get(email)

      read.onsuccess = () => {
        const merged = { ...change((read.result as CachedAccount | undefined) ?? {}), email }

        store.put(merged).onsuccess = () => done(true)
      }
    })
  } catch {
    // Being unable to cache is not a reason to fail the request that produced the data.
    return false
  }
}

/** Keeps the vault key, still wrapped, which is the half that comes from `GET /vaults`. */
export async function cacheVaultKey(email: string, vault: Vault): Promise<boolean> {
  return mergeIntoRecord(email, (current) => ({
    ...current,
    vault: {
      id: vault.id,
      wrappedKey: vault.wrapped_key,
      wrappedKeyIv: vault.wrapped_key_iv,
    },
    savedAt: new Date().toISOString(),
  }))
}

/**
 * Keeps the encrypted items, which is the half that comes from `GET /items`.
 *
 * REPLACING AND NOT ADDING, and it matters: an item deleted on another device has to
 * disappear from here too. Keeping the old ones would leave entries alive on a phone
 * after they were removed on purpose, and one of them may have been removed *because*
 * it leaked.
 */
export async function cacheItems(email: string, items: EncryptedItem[]): Promise<boolean> {
  return mergeIntoRecord(email, (current) => ({
    ...current,
    /*
     * The fields the server stores and no more. Spreading the item wholesale would
     * carry along whatever the API grows next without anyone deciding it should live
     * on a disk.
     */
    items: items.map(({ id, vault_id, ciphertext, iv, version, created_at, updated_at }) => ({
      id,
      vault_id,
      ciphertext,
      iv,
      version,
      created_at,
      updated_at,
    })),
    savedAt: new Date().toISOString(),
  }))
}

/** Removes one account's cache and leaves the others alone. */
export async function forgetCachedAccount(email: string): Promise<boolean> {
  if (!isCacheSupported()) return false

  try {
    return await runTransaction<boolean>('readwrite', (store, done) => {
      store.delete(email).onsuccess = () => done(true)
    })
  } catch {
    return false
  }
}

/**
 * Removes every account's cache from this device.
 *
 * It exists for the case where the answer has to be «there is nothing left here» rather
 * than «there is nothing left for you»: turning the option off, or clearing a shared
 * browser.
 */
export async function forgetEveryCachedAccount(): Promise<boolean> {
  if (!isCacheSupported()) return false

  try {
    return await runTransaction<boolean>('readwrite', (store, done) => {
      store.clear().onsuccess = () => done(true)
    })
  } catch {
    return false
  }
}
