import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { api } from '@/lib/api'
import { forgetAccountOnThisDevice, logOut } from '@/lib/auth'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { cacheItems, cacheVaultKey, readCachedAccount } from '@/lib/vault/deviceCache'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * The two promises of ADR-019 §5 whose breaking nobody would notice. See issue #461.
 *
 * WHY THEY GET A FILE OF THEIR OWN. A cache that fails to clear does not fail: the
 * application is faster, nothing errors, and every screen looks right. It is discovered
 * on the day it matters — a shared computer, a device that changed hands — which is the
 * worst possible day to discover it.
 *
 * AND «CLEARED» IS NOT THE SAME AS «CLEARED ON LOCK». Locking must NOT remove the copy:
 * reloading is a lock, and the whole point of ADR-019 is that the vault stays readable
 * afterwards with no network. Signing out is a different sentence — «I am done on this
 * machine» — and that one takes the copy with it. A test that only checked «it goes»
 * would pass over an implementation that destroyed the feature.
 */

const ADA = 'ada@evault.test'
const GRACE = 'grace@evault.test'

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta',
  wrapped_key_iv: 'nonce',
}

const ITEMS: EncryptedItem[] = [
  {
    id: 'item-1',
    vault_id: 'vault-1',
    ciphertext: 'Y2lmcmFkbw==',
    iv: 'bm9uY2U=',
    version: 2,
    created_at: null,
    updated_at: null,
  },
]

/** Both accounts hold a copy, because that is the situation this instance is really in. */
async function seedBothAccounts(): Promise<void> {
  await cacheVaultKey(ADA, VAULT)
  await cacheItems(ADA, ITEMS)
  await cacheVaultKey(GRACE, { ...VAULT, id: 'vault-2' })
  await cacheItems(GRACE, [{ ...ITEMS[0], id: 'item-2', ciphertext: 'b3Rybw==' }])
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  useSession.setState({
    user: { id: 1, name: 'Ada', email: ADA, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: ADA },
  })
  useVaultKey.setState({ key: {} as CryptoKey })

  vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

  await seedBothAccounts()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('signing out', () => {
  it('takes this account’s copy off the device', async () => {
    expect(await readCachedAccount(ADA)).not.toBeNull()

    await logOut()

    expect(await readCachedAccount(ADA)).toBeNull()
  })

  /*
   * The other account on this instance may be using the same browser. Its copy is not
   * this session's to remove, and removing it would look like a bug in somebody else's
   * offline access.
   */
  it('leaves the other account’s copy alone', async () => {
    await logOut()

    expect(await readCachedAccount(GRACE)).not.toBeNull()
  })

  /*
   * The request is the least important part of signing out. If the server does not
   * answer, the copy still has to go: otherwise a downed network would be enough to
   * leave a vault behind on a machine its owner believes they left.
   */
  it('clears the copy even when the server does not answer', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('sin red'))

    await logOut()

    expect(await readCachedAccount(ADA)).toBeNull()
  })

  /*
   * In an offline session `user` is null, because the server never answered. Reading
   * only that would skip the clearing in exactly the case where the cache is the point.
   */
  it('clears it for an offline session too, which has no user', async () => {
    useSession.setState({ user: null, token: null, offline: true })

    await logOut()

    expect(await readCachedAccount(ADA)).toBeNull()
  })
})

describe('locking, which is not the same thing', () => {
  /*
   * THE TEST THAT STOPS THE FIX FROM DESTROYING THE FEATURE. Reloading is a lock, and
   * after it the vault has to stay readable with no network — that is all of ADR-019. An
   * implementation that cleared the copy on every lock would pass every test above and
   * leave nothing working.
   */
  it('leaves the copy exactly where it was', async () => {
    useSession.getState().clearSession()
    useVaultKey.getState().forget()

    const cached = await readCachedAccount(ADA)

    expect(cached?.items).toHaveLength(1)
    expect(cached?.vault.wrappedKey).toBe(VAULT.wrapped_key)
  })
})

describe('forgetting this account on this device', () => {
  /*
   * The button on the unlock screen says «forget this account on this device». If it
   * only forgot the email, the encrypted vault would stay — the opposite of what it
   * says, with nothing failing to give it away.
   */
  it('takes the copy with it, not just the remembered email', async () => {
    await forgetAccountOnThisDevice()

    expect(useSession.getState().rememberedUser).toBeNull()
    expect(await readCachedAccount(ADA)).toBeNull()
  })

  it('leaves the other account’s copy alone', async () => {
    await forgetAccountOnThisDevice()

    expect(await readCachedAccount(GRACE)).not.toBeNull()
  })
})
