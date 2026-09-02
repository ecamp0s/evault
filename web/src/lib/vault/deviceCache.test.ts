import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// jsdom implements no IndexedDB, so the tests would have nothing to run against. It is a
// devDependency and reaches no bundle. Testing the logic against a hand-written double
// instead would leave the adapter — the part that can actually be wrong — uncovered.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import {
  cacheItems,
  cacheVaultKey,
  forgetCachedAccount,
  forgetEveryCachedAccount,
  isCacheSupported,
  readCachedAccount,
} from '@/lib/vault/deviceCache'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * What this device keeps so the vault can be read without a network. See ADR-019 and
 * issue #459.
 *
 * THE PROMISE THIS FILE PROTECTS IS NOT «IT SAVES AND LOADS». It is that what lands on a
 * disk is what the server already held, that one account cannot reach another's, and
 * that a browser which cannot cache behaves exactly like one that never did.
 */

const vault: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta-en-base64',
  wrapped_key_iv: 'nonce-de-la-clave',
}

const items: EncryptedItem[] = [
  {
    id: 'item-1',
    vault_id: 'vault-1',
    ciphertext: 'Y2lmcmFkbw==',
    iv: 'bm9uY2U=',
    version: 2,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  },
]

/** Everything actually written, read back through a connection this module did not open. */
async function everythingStored(): Promise<unknown[]> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('evault.cache')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('cuentas', 'readonly').objectStore('cuentas').getAll()
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

beforeEach(() => {
  // A brand-new factory per test: fake-indexeddb keeps its databases in the instance.
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('the vault kept on this device', () => {
  it('gives back the ciphertext exactly as it arrived', async () => {
    await cacheVaultKey('ada@example.com', vault)
    await cacheItems('ada@example.com', items)

    const cached = await readCachedAccount('ada@example.com')

    expect(cached?.items).toEqual(items)
    expect(cached?.vault.wrappedKey).toBe(vault.wrapped_key)
    expect(cached?.vault.wrappedKeyIv).toBe(vault.wrapped_key_iv)
  })

  /*
   * The two halves arrive from two different requests — `GET /vaults` and `GET /items` —
   * and the first version of this module wrote the whole record from each, so whichever
   * landed second erased the other's half.
   */
  it('keeps both halves, whichever of the two requests answers first', async () => {
    await cacheItems('ada@example.com', items)
    await cacheVaultKey('ada@example.com', vault)

    const cached = await readCachedAccount('ada@example.com')

    expect(cached?.items).toEqual(items)
    expect(cached?.vault.id).toBe('vault-1')
  })

  /*
   * Half a record opens nothing. Answering it as a cache would turn «there is nothing
   * here» into a decryption failure further down, which is a far worse thing to debug.
   */
  it('answers nothing while it only has half of what it needs', async () => {
    await cacheVaultKey('ada@example.com', vault)

    expect(await readCachedAccount('ada@example.com')).toBeNull()
  })

  it('has nothing for an account that never cached', async () => {
    expect(await readCachedAccount('nadie@example.com')).toBeNull()
  })
})

describe('what lands on the disk', () => {
  /*
   * THE CENTRAL PROMISE OF ADR-019, and the reason it is checked by searching the stored
   * bytes rather than by inspecting the shape: a field added later, or an item spread
   * wholesale, would carry plaintext along without any assertion about `items` noticing.
   * This looks for the plaintext itself, wherever it ended up.
   */
  it('holds no decrypted content anywhere', async () => {
    const marker = 'CONTRASEÑA-EN-CLARO-QUE-NO-DEBE-ESTAR'

    await cacheVaultKey('ada@example.com', vault)
    await cacheItems('ada@example.com', [
      // As if something had leaked a decrypted field into the encrypted item.
      { ...items[0], nombre: marker, password: marker } as unknown as EncryptedItem,
    ])

    expect(JSON.stringify(await everythingStored())).not.toContain(marker)
  })

  it('holds no unwrapped key, only the wrapped one', async () => {
    await cacheVaultKey('ada@example.com', vault)
    await cacheItems('ada@example.com', items)

    const stored = JSON.stringify(await everythingStored())

    expect(stored).toContain(vault.wrapped_key)
    expect(stored).not.toContain('CryptoKey')
  })
})

describe('one account and another', () => {
  beforeEach(async () => {
    await cacheVaultKey('ada@example.com', vault)
    await cacheItems('ada@example.com', items)
    await cacheVaultKey('grace@example.com', { ...vault, id: 'vault-2' })
    await cacheItems('grace@example.com', [{ ...items[0], id: 'item-2', ciphertext: 'b3Rybw==' }])
  })

  /*
   * The instance has two real accounts and they share at least one browser. If this
   * failed, one person's vault would be sitting under the other's unlock screen.
   */
  it('never hands one account what belongs to another', async () => {
    const ada = await readCachedAccount('ada@example.com')
    const grace = await readCachedAccount('grace@example.com')

    expect(ada?.items[0].ciphertext).toBe('Y2lmcmFkbw==')
    expect(grace?.items[0].ciphertext).toBe('b3Rybw==')
    expect(ada?.vault.id).not.toBe(grace?.vault.id)
  })

  it('forgetting one account leaves the other alone', async () => {
    await forgetCachedAccount('ada@example.com')

    expect(await readCachedAccount('ada@example.com')).toBeNull()
    expect(await readCachedAccount('grace@example.com')).not.toBeNull()
  })

  it('forgetting everything leaves nothing for anybody', async () => {
    await forgetEveryCachedAccount()

    expect(await readCachedAccount('ada@example.com')).toBeNull()
    expect(await readCachedAccount('grace@example.com')).toBeNull()
    expect(await everythingStored()).toEqual([])
  })
})

describe('a database that will not open', () => {
  /*
   * A newer build wrote a newer schema and then the user rolled back. It is the shape of
   * failure that turns a working device into one that cannot read its own vault, so what
   * this checks is that it degrades to «there is no cache» and never to an exception.
   */
  beforeEach(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('evault.cache', 99)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    database.close()
  })

  it('reads nothing instead of failing', async () => {
    await expect(readCachedAccount('ada@example.com')).resolves.toBeNull()
  })

  it('says it could not write, instead of failing', async () => {
    await expect(cacheVaultKey('ada@example.com', vault)).resolves.toBe(false)
    await expect(cacheItems('ada@example.com', items)).resolves.toBe(false)
    await expect(forgetCachedAccount('ada@example.com')).resolves.toBe(false)
    await expect(forgetEveryCachedAccount()).resolves.toBe(false)
  })
})

describe('a value the browser refuses to store', () => {
  /*
   * Structured cloning rejects a function, and `put` throws from inside the event
   * handler, which aborts the transaction without any request reporting an error.
   * Without the abort handler the caller would wait forever — and waiting forever is a
   * worse failure than being told the cache did not work.
   */
  it('answers instead of hanging', async () => {
    const unstorable = [{ ...items[0], ciphertext: (() => 'no') as unknown as string }]

    await expect(cacheItems('ada@example.com', unstorable)).resolves.toBe(false)
  })
})

describe('a browser that cannot cache', () => {
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB')
  })

  /*
   * A private window, an older browser, or storage blocked outright. It has to behave
   * like a device that simply never cached — never like one that cannot open its vault.
   */
  it('says so instead of throwing', () => {
    expect(isCacheSupported()).toBe(false)
  })

  /*
   * Some browsers do not merely leave `indexedDB` undefined when storage is blocked:
   * they throw on the access itself. Answering that with an exception would take a
   * private window and make it a window where the vault does not open.
   */
  it('survives a browser that throws on being asked', () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('El acceso al almacenamiento está bloqueado')
      },
    })

    expect(isCacheSupported()).toBe(false)
  })

  it('reads nothing and writes nothing, without failing', async () => {
    await expect(readCachedAccount('ada@example.com')).resolves.toBeNull()
    await expect(cacheVaultKey('ada@example.com', vault)).resolves.toBe(false)
    await expect(cacheItems('ada@example.com', items)).resolves.toBe(false)
    await expect(forgetCachedAccount('ada@example.com')).resolves.toBe(false)
    await expect(forgetEveryCachedAccount()).resolves.toBe(false)
  })
})
