import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { api } from '@/lib/api'
import { logIn, unlock } from '@/lib/auth'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { createVaultKey, deriveKeys } from '@/lib/vault/crypto'
import { cacheItems, cacheVaultKey } from '@/lib/vault/deviceCache'
import { useOfflinePreference } from '@/lib/vault/offlinePreference'
import { listItems, listVaults } from '@/lib/vault/api'
import { pack } from '@/lib/vault/payload'
import type { EncryptedItem, Vault } from '@/lib/vault/types'

/*
 * Opening the vault with no server at all. See ADR-019 and issue #460.
 *
 * WHAT MAKES THIS POSSIBLE, and it is the whole reason the feature is cheap: by ADR-008
 * the authentication hash only buys a token, and a token only fetches ciphertext. With
 * the ciphertext already on the device there is nothing left to ask anybody for.
 *
 * THE TEST THAT MATTERS MOST IS NOT «IT OPENS». It is that a wrong password still fails,
 * and that a 401 does NOT fall back to the cache — because a fallback on the wrong error
 * would be invisible: everything would keep working, and the checking would be gone.
 */

const EMAIL = 'ada@evault.test'
const PASSWORD = 'una contraseña maestra larga'

let items: EncryptedItem[]
let vault: Vault

/** An error shaped like the one axios raises when nothing answered. */
function noAnswer(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK')
}

/** A real 401, which DID reach the server. */
function wrongCredentials(): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST')

  // @ts-expect-error the test only needs the fields interpretError reads.
  error.response = { status: 401, data: { message: 'Credenciales incorrectas' } }

  return error
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  useSession.setState({ user: null, token: null, offline: false, rememberedUser: null })
  useVaultKey.getState().forget()
  useOfflinePreference.setState({ enabled: true })

  /*
   * The cache is seeded exactly as the application would have left it: a vault key
   * really wrapped with the master key this password derives, and items really
   * encrypted. Fixtures made of literals would prove that a string comes back, not that
   * a vault opens.
   */
  const { masterKey } = await deriveKeys(PASSWORD, EMAIL)
  const { vaultKey, wrapped } = await createVaultKey(masterKey)

  vault = {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.data,
    wrapped_key_iv: wrapped.iv,
  }

  items = [
    {
      id: 'item-1',
      vault_id: 'vault-1',
      ...(await pack(vaultKey, { nombre: 'GitHub', password: 'la de github' })),
      created_at: null,
      updated_at: null,
    },
  ]

  await cacheVaultKey(EMAIL, vault)
  await cacheItems(EMAIL, items)
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('with no server and a copy on this device', () => {
  beforeEach(() => {
    vi.spyOn(api, 'post').mockRejectedValue(noAnswer())
  })

  it('the right master password opens the vault', async () => {
    await logIn({ email: EMAIL, password: PASSWORD })

    expect(useVaultKey.getState().key).not.toBeNull()
    expect(useSession.getState().offline).toBe(true)
  })

  /*
   * There is no token, so anything keying off one would bounce the user straight back
   * to the unlock screen with the vault already open behind it.
   */
  it('the session has no token, and says it is offline', async () => {
    await logIn({ email: EMAIL, password: PASSWORD })

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().rememberedUser?.email).toBe(EMAIL)
  })

  /*
   * The same `DecryptionError` as online, from the same operation on the same bytes.
   * If this ever stopped failing, the cache would be opening for anybody holding the
   * device.
   */
  it('a wrong master password still fails', async () => {
    await expect(logIn({ email: EMAIL, password: 'la que no es' })).rejects.toThrow()

    expect(useVaultKey.getState().key).toBeNull()
    expect(useSession.getState().offline).toBe(false)
  })

  it('the entries are read from the device, decrypted', async () => {
    await logIn({ email: EMAIL, password: PASSWORD })

    const listed = await listItems('vault-1')

    expect(listed).toHaveLength(1)
    expect(listed[0].content.nombre).toBe('GitHub')
    expect(listed[0].content.password).toBe('la de github')
  })

  it('the vault comes from the device too, with its wrapped key', async () => {
    await logIn({ email: EMAIL, password: PASSWORD })

    const vaults = await listVaults()

    expect(vaults).toHaveLength(1)
    expect(vaults[0].wrapped_key).toBe(vault.wrapped_key)
  })

  /*
   * The point of the whole feature: no request leaves the device. If one did, it would
   * fail anyway — but it would also mean the path depends on a server that is not there.
   */
  it('asks the server for nothing at all', async () => {
    const get = vi.spyOn(api, 'get')

    await logIn({ email: EMAIL, password: PASSWORD })
    await listVaults()
    await listItems('vault-1')

    expect(get).not.toHaveBeenCalled()
  })

  it('unlocking a remembered account works the same way', async () => {
    useSession.setState({ rememberedUser: { name: 'Ada', email: EMAIL } })

    await unlock(PASSWORD)

    expect(useVaultKey.getState().key).not.toBeNull()
    expect(useSession.getState().rememberedUser?.name).toBe('Ada')
  })
})

describe('what must NOT fall back to the cache', () => {
  /*
   * A 401 reached the server and is an answer, not silence. Falling back here would turn
   * a rejected password into an attempt at opening the vault anyway — and worse, it
   * would work for anybody who knows the master password but was locked out on purpose.
   */
  it('a 401 fails as a 401, without touching the cache', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(wrongCredentials())

    await expect(logIn({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      state: 401,
    })

    expect(useVaultKey.getState().key).toBeNull()
    expect(useSession.getState().offline).toBe(false)
  })
})

describe('with no server and no copy on this device', () => {
  /*
   * What is reported is the missing network and not the missing cache: the copy is
   * absent BECAUSE nobody ever cached, and what has to be fixed is the connection.
   */
  it('says there is no connection, not that there is no cache', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(noAnswer())

    await expect(logIn({ email: 'nadie@evault.test', password: PASSWORD })).rejects.toThrow(
      /No hay conexión/,
    )

    expect(useVaultKey.getState().key).toBeNull()
  })
})
