import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from './api'
import { unlock, logOut } from './auth'
import { useSession, type User } from './session'
import { useVaultKey } from './vault/keyInMemory'
import { createVaultKey, deriveKeys } from './vault/crypto'
import type { Vault } from './vault/types'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null, has_recovery_key: false
}

const MASTER = 'una contraseña maestra larga'

function errorWithStatus(state: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: state, statusText: '', data: {}, headers, config: { headers } }

  return error
}

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

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null, token: null, rememberedUser: null })
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * Issue #73 and ADR-007 in a single block: what cannot happen is the token surviving
 * the reload in any shape.
 */
describe('where the token lives', () => {
  it('does not show up in localStorage on authenticating', () => {
    useSession.getState().authenticate(ADA, 'token-secretísimo')

    expect(JSON.stringify(localStorage)).not.toContain('token-secretísimo')
  })

  it('does not show up in sessionStorage or in cookies', () => {
    useSession.getState().authenticate(ADA, 'token-secretísimo')

    expect(Object.keys(sessionStorage)).toHaveLength(0)
    expect(document.cookie).not.toContain('token-secretísimo')
  })

  /*
   * What is persisted, and why: without the email there would be nobody to ask the
   * master password of, and reloading would be an eviction to the blank form instead of
   * a lock. It is no secret: the user wrote it themselves.
   */
  it('does remember who was using the application', () => {
    useSession.getState().authenticate(ADA, 'token')

    const saved = JSON.stringify(localStorage)

    expect(saved).toContain('ada@evault.test')
    expect(saved).toContain('Ada Lovelace')
  })

  it('the list of persisted fields is exactly one', () => {
    useSession.getState().authenticate(ADA, 'token')

    const saved = JSON.parse(localStorage.getItem('evault.sesion') ?? '{}') as {
      state: Record<string, unknown>
    }

    expect(Object.keys(saved.state)).toEqual(['rememberedUser'])
  })
})

describe('closing the session and forgetting', () => {
  /*
   * The distinction that makes locking possible: closing the session does not erase who
   * you were. Were it to erase it, reloading would lead to the blank sign-in form, which
   * is exactly what ADR-007 asks to avoid.
   */
  it('clearSession leaves the remembered user', () => {
    useSession.getState().authenticate(ADA, 'token')
    useSession.getState().clearSession()

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().rememberedUser?.email).toBe('ada@evault.test')
  })

  it('forgetUser does erase it, for the shared computer', () => {
    useSession.getState().authenticate(ADA, 'token')
    useSession.getState().forgetUser()

    expect(useSession.getState().rememberedUser).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })
})

describe('signing out', () => {
  it('revokes the token on the server', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null })
    useSession.getState().authenticate(ADA, 'token')

    await logOut()

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * If the server does not answer, the local session is closed all the same. Leaving it
   * open would be the worst of the two options: the user believes they have signed out
   * and they have not. A live token on the server is recoverable; an open session on a
   * shared computer is not.
   */
  it('clears the local session even if the request fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    useSession.getState().authenticate(ADA, 'token')

    await expect(logOut()).resolves.toBeUndefined()

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().user).toBeNull()
  })

  it('forgets the vault key too', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: null })

    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { vaultKey } = await createVaultKey(masterKey)

    useSession.getState().authenticate(ADA, 'token')
    useVaultKey.getState().save(vaultKey)

    await logOut()

    expect(useVaultKey.getState().key).toBeNull()
  })
})

/*
 * Replaces the tests of the old hydrateSession, which verified against /auth/me the
 * token recovered from localStorage. There is no longer a token to recover.
 */
describe('unlock', () => {
  it('uses the remembered email, without asking for it again', async () => {
    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { wrapped } = await createVaultKey(masterKey)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-nuevo' } } })
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vaultWith(wrapped)] } } })

    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    await unlock(MASTER)

    expect((post.mock.calls[0]?.[1] as { email: string }).email).toBe('ada@evault.test')
    expect(useSession.getState().token).toBe('token-nuevo')
    expect(useVaultKey.getState().key).not.toBeNull()
  })

  it('does not send the master password', async () => {
    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { wrapped } = await createVaultKey(masterKey)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-nuevo' } } })
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vaultWith(wrapped)] } } })

    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    await unlock(MASTER)

    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain(MASTER)
  })

  it('propagates the rejection if the password is not the right one', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(401))

    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    await expect(unlock('la que no es')).rejects.toThrow()
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * It should not happen, because the screen is only shown with a remembered user. It
   * fails explicitly instead of trying to sign in with an empty email, which would come
   * back «credenciales incorrectas» and mislead whoever investigates it.
   */
  it('fails if there is no remembered account', async () => {
    const post = vi.spyOn(api, 'post')

    await expect(unlock(MASTER)).rejects.toThrow(/cuenta recordada/i)
    expect(post).not.toHaveBeenCalled()
  })
})
