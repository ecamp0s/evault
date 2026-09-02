import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { unlockForTest, encryptedItem } from '@/test/vault'
import { listItems, listVaults } from '@/lib/vault/api'
import { cacheItems, readCachedAccount } from '@/lib/vault/deviceCache'
import { useOfflinePreference } from '@/lib/vault/offlinePreference'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * When the device actually writes the cache, and when it must not. See ADR-019 and
 * issue #459.
 *
 * THE HALF THAT MATTERS HERE IS THE «MUST NOT». `deviceCache.test.ts` proves the store
 * keeps what it is given; this file proves nothing is given to it unless somebody
 * turned the option on, because a cache that writes itself without being asked is the
 * failure ADR-019 §2 is arranged to prevent — and it is invisible, since an application
 * caching too eagerly behaves exactly like one behaving correctly.
 */

/*
 * Only so one test can make the cache throw. Everything else runs against the real
 * module, because a wiring test that mocks away what it is wiring proves nothing.
 */
vi.mock('@/lib/vault/deviceCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vault/deviceCache')>()

  return { ...actual, cacheItems: vi.fn(actual.cacheItems) }
})

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta-de-prueba',
  wrapped_key_iv: 'nonce-de-prueba',
}

const ADA = {
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
  created_at: null,
  has_recovery_key: false,
}

let items: EncryptedItem[]

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  const key = await unlockForTest()
  items = [await encryptedItem(key, 'item-1', { nombre: 'GitHub', password: 'secreta' })]

  useSession.setState({ user: ADA, token: 'token-de-prueba' })
  useOfflinePreference.setState({ enabled: false })

  vi.spyOn(api, 'get').mockImplementation((url: string) =>
    Promise.resolve(
      url === '/vaults'
        ? { data: { data: { vaults: [VAULT] } } }
        : { data: { data: { items } } },
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

/** Both requests, in the order the application makes them. */
async function loadTheVault(): Promise<void> {
  await listVaults()
  await listItems('vault-1')
}

describe('with the option off, which is how it ships', () => {
  it('writes nothing to this device', async () => {
    await loadTheVault()

    expect(await readCachedAccount(ADA.email)).toBeNull()
  })
})

describe('with the option on', () => {
  beforeEach(() => {
    useOfflinePreference.setState({ enabled: true })
  })

  it('keeps the wrapped key and the ciphertext, under this account', async () => {
    await loadTheVault()

    const cached = await readCachedAccount(ADA.email)

    expect(cached?.vault.wrappedKey).toBe(VAULT.wrapped_key)
    expect(cached?.items).toEqual(items)
  })

  /*
   * The point of writing before `toItem` runs: at the moment of storing, the decrypted
   * content does not exist yet. Caching afterwards would mean holding it in hand while
   * writing to a disk, which is the mistake the ordering makes impossible.
   */
  it('keeps the ciphertext and not what it decrypts to', async () => {
    await loadTheVault()

    expect(JSON.stringify(await readCachedAccount(ADA.email))).not.toContain('GitHub')
  })

  it('writes nothing while nobody is signed in', async () => {
    useSession.setState({ user: null })

    await loadTheVault()

    expect(await readCachedAccount(ADA.email)).toBeNull()
  })

  /*
   * `deviceCache` swallows its own failures, so today this cannot happen. The handler
   * exists for the day somebody adds a path that throws, and the day that happens the
   * vault must still open — an unhandled rejection taking down a listing would be a
   * failure caused entirely by a convenience.
   */
  it('a cache that throws does not take the listing with it', async () => {
    vi.mocked(cacheItems).mockRejectedValueOnce(new Error('la caché explotó'))

    const listed = await listItems('vault-1')

    expect(listed[0].content.nombre).toBe('GitHub')
  })

  /*
   * The cache is a convenience and the vault is not. A device whose storage is blocked
   * has to keep listing items exactly as before.
   */
  it('a device that cannot cache still reads its vault', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB')

    const vaults = await listVaults()
    const listed = await listItems('vault-1')

    expect(vaults).toEqual([VAULT])
    expect(listed[0].content.nombre).toBe('GitHub')
  })
})
