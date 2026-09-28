import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { AxiosError } from 'axios'
import { api, ApiError } from '@/lib/api'
import { useSession } from '@/lib/session'
import { createVaultKey, DecryptionError, deriveKeys, type DerivedKeys } from './crypto'
import { cacheItems, cacheVaultKey, readCachedAccount } from './deviceCache'
import { deleteAccount } from './deleteAccount'
import { useVaultKey } from './keyInMemory'
import type { Vault } from './types'

/*
 * Deleting the account from the web. See ADR-024 and #715.
 *
 * Only axios is faked, like masterPassword.test.ts: the cryptography is real, because
 * what this file protects is that a wrong master password is caught HERE, before any
 * request —a 401 would sign out somebody who only mistyped— and that after the server
 * says yes this device keeps nothing of the account.
 */

const EMAIL = 'ada@evault.test'
const MASTER = 'la contraseña maestra de siempre'

let keys: DerivedKeys
let vault: Vault

beforeAll(async () => {
  keys = await deriveKeys(MASTER, EMAIL)
}, 30_000)

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  const { vaultKey, wrapped } = await createVaultKey(keys.masterKey)
  vault = {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.data,
    wrapped_key_iv: wrapped.iv,
  }

  useVaultKey.setState({ key: vaultKey })
  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })

  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vault] } } })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('before anything is sent', () => {
  it('a wrong master password is caught here, and no request goes out', async () => {
    const remove = vi.spyOn(api, 'delete')

    await expect(deleteAccount(EMAIL, EMAIL, 'esta no es')).rejects.toBeInstanceOf(DecryptionError)

    expect(remove).not.toHaveBeenCalled()
    expect(useSession.getState().user?.email).toBe(EMAIL)
  })
})

describe('what is sent', () => {
  it('the hash derived from the ACCOUNT email, and the email as it was typed', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: null })

    await deleteAccount(EMAIL, '  ADA@evault.test ', MASTER)

    expect(remove).toHaveBeenCalledWith('/auth/account', {
      data: { current_password: keys.authHash, email: '  ADA@evault.test ' },
    })
  })
})

/** Leaves a complete offline copy of the account on this device: key and items. */
async function cacheTheAccount() {
  await cacheVaultKey(EMAIL, vault)
  await cacheItems(EMAIL, [])
}

describe('after the server says yes', () => {
  it('this device forgets the key, the offline copy and the remembered user', async () => {
    vi.spyOn(api, 'delete').mockResolvedValue({ data: null })
    await cacheTheAccount()
    expect(await readCachedAccount(EMAIL)).not.toBeNull()

    await deleteAccount(EMAIL, EMAIL, MASTER)

    expect(useVaultKey.getState().key).toBeNull()
    expect(await readCachedAccount(EMAIL)).toBeNull()
    expect(useSession.getState()).toMatchObject({ user: null, token: null, rememberedUser: null })
  })

  it('when the server refuses, this device keeps everything', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
    await cacheTheAccount()

    const error = await deleteAccount(EMAIL, EMAIL, MASTER).catch((raised: unknown) => raised)

    expect(error).toBeInstanceOf(ApiError)
    expect(useVaultKey.getState().key).not.toBeNull()
    expect(await readCachedAccount(EMAIL)).not.toBeNull()
    expect(useSession.getState().rememberedUser?.email).toBe(EMAIL)
  })
})
