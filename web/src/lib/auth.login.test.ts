import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from './api'
import { logIn } from './auth'
import { useSession, type User } from './session'
import { useVaultKey } from './vault/keyInMemory'
import { VaultUnreachable } from './vault/unlock'
import { DecryptionError, encrypt, createVaultKey, deriveKeys } from './vault/crypto'
import type { Vault } from './vault/types'

/*
 * Signing in is two steps —authenticating and opening the vault— and what these tests
 * watch over is that they stay two and that they fail separately. Confusing them would
 * give a user inside an application that cannot show them anything.
 */

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null, has_recovery_key: false
}

const MASTER = 'una contraseña maestra larga'
const EMAIL = 'ada@evault.test'

function errorWithStatus(state: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: state, statusText: '', data: {}, headers, config: { headers } }

  return error
}

/** A vault as the API would return it, with whatever wrapped key it is handed. */
function vaultWith(wrapped: { data: string; iv: string }): Vault {
  return {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.data,
    wrapped_key_iv: wrapped.iv,
  }
}

/** Sets up the server: a login that answers and a /vaults returning whatever it is told. */
function serverReturning(vaults: Vault[]) {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { data: { user: ADA, token: 'token-de-prueba' } },
  })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

beforeEach(() => {
  useSession.setState({ user: null, token: null, rememberedUser: null })
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signing in', () => {
  it('does not send the master password, but the authentication hash', async () => {
    const { masterKey, authHash } = await deriveKeys(MASTER, EMAIL)
    const { wrapped } = await createVaultKey(masterKey)

    serverReturning([vaultWith(wrapped)])

    await logIn({ email: EMAIL, password: MASTER })

    const body = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, string>

    expect(JSON.stringify(body)).not.toContain(MASTER)
    expect(body.password).toBe(authHash)
  })

  /*
   * ADR-008 puts it as the main argument in favour of the chosen design: the wrapped key
   * travels through /api/vaults, so the contract of /api/auth stays as it was. This test
   * pins it down over the request's real body.
   */
  it('does not change the login contract', async () => {
    const { masterKey } = await deriveKeys(MASTER, EMAIL)
    const { wrapped } = await createVaultKey(masterKey)

    serverReturning([vaultWith(wrapped)])

    await logIn({ email: EMAIL, password: MASTER })

    expect(vi.mocked(api.post).mock.calls[0]?.[0]).toBe('/auth/login')
    expect(Object.keys(vi.mocked(api.post).mock.calls[0]?.[1] as object)).toEqual([
      'email',
      'password',
    ])
  })

  it('leaves the session open and the vault unlocked', async () => {
    const { masterKey } = await deriveKeys(MASTER, EMAIL)
    const { wrapped } = await createVaultKey(masterKey)

    serverReturning([vaultWith(wrapped)])

    await logIn({ email: EMAIL, password: MASTER })

    expect(useSession.getState().token).toBe('token-de-prueba')
    expect(useVaultKey.getState().key).not.toBeNull()
  })

  /*
   * The check that the cycle really closes: what was encrypted at sign-up can be read
   * after signing in. Without this, the login could be leaving in memory a perfectly
   * formed key that opens nothing of what is stored.
   */
  it('the key it leaves in memory decrypts what the sign-up encrypted', async () => {
    const { masterKey } = await deriveKeys(MASTER, EMAIL)
    const { vaultKey, wrapped } = await createVaultKey(masterKey)
    const savedBefore = await encrypt(vaultKey, 'la contraseña de GitHub')

    serverReturning([vaultWith(wrapped)])

    await logIn({ email: EMAIL, password: MASTER })

    const { decrypt } = await import('./vault/crypto')
    const inMemory = useVaultKey.getState().key as CryptoKey

    expect(await decrypt(inMemory, savedBefore)).toBe('la contraseña de GitHub')
  })
})

describe('when the login fails', () => {
  it('propagates the error and leaves neither session nor key', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(422))

    await expect(logIn({ email: EMAIL, password: MASTER })).rejects.toThrow()

    expect(useSession.getState().token).toBeNull()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('does not get as far as asking for the vaults', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(422))
    const get = vi.spyOn(api, 'get')

    await expect(logIn({ email: EMAIL, password: MASTER })).rejects.toThrow()

    expect(get).not.toHaveBeenCalled()
  })
})

/*
 * The case that gives the issue its name: correct credentials and a vault that does not
 * open.
 *
 * The session never gets published, and that is no implementation detail: the store is
 * what the guards look at, so a token set halfway navigates to the front page,
 * unmounts the login and takes the error message with it. It was seen in the browser as
 * a form that emptied itself without saying anything.
 */
describe('when the login works but the vault does not open', () => {
  it('throws DecryptionError if the wrapped key is not from this password', async () => {
    const { masterKey } = await deriveKeys('otra contraseña distinta', EMAIL)
    const { wrapped } = await createVaultKey(masterKey)

    serverReturning([vaultWith(wrapped)])

    await expect(logIn({ email: EMAIL, password: MASTER })).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('does not publish the session, so the screen stays alive and can warn', async () => {
    const { masterKey } = await deriveKeys('otra contraseña distinta', EMAIL)
    const { wrapped } = await createVaultKey(masterKey)

    serverReturning([vaultWith(wrapped)])

    await expect(logIn({ email: EMAIL, password: MASTER })).rejects.toThrow()

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().user).toBeNull()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('tells apart the account with no vaults, which is a different breakage', async () => {
    serverReturning([])

    await expect(logIn({ email: EMAIL, password: MASTER })).rejects.toBeInstanceOf(
      VaultUnreachable,
    )
  })
})
