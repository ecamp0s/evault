import { beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from './api'
import { useSession, type User } from './session'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: '2026-07-30T00:00:00+00:00', has_recovery_key: false
}

/**
 * Makes a real request through the client, with an adapter that intercepts it before it
 * goes out to the network and returns the configuration that would have travelled.
 *
 * Replacing the adapter and not the interceptors is what makes the test trustworthy: the
 * interceptors really run, in their real order, exactly as in the application.
 */
async function sentHeaders(): Promise<Record<string, unknown>> {
  const originalAdapter = api.defaults.adapter
  let captured: InternalAxiosRequestConfig | undefined

  api.defaults.adapter = async (config) => {
    captured = config

    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }

  try {
    await api.get('/loquesea')
  } finally {
    api.defaults.adapter = originalAdapter
  }

  return (captured?.headers ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  useSession.getState().clearSession()
})

describe('the session store', () => {
  it('starts with no user and no token', () => {
    expect(useSession.getState().user).toBeNull()
    expect(useSession.getState().token).toBeNull()
  })

  it('stores user and token on authenticating', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    expect(useSession.getState().user).toEqual(ADA)
    expect(useSession.getState().token).toBe('token-secreto')
  })

  it('clears them on signing out', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')
    useSession.getState().clearSession()

    expect(useSession.getState().user).toBeNull()
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * This test is inverted from how it was born, like the one for the list's empty state.
   * It used to check that the session survived a refresh, which was right while the API
   * stored no secrets; since ADR-007 it checks the opposite, and the reason is argued
   * there: the encryption key cannot be persisted, so a token that survives keeps alive
   * a session incapable of showing anything, in exchange for an XSS being able to take
   * it.
   *
   * If it fails again, the question is not how to make it pass but who has put the token
   * back into localStorage.
   */
  it('does not persist the token, so that it does not survive a refresh', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    expect(localStorage.getItem('evault.sesion')).not.toContain('token-secreto')
  })

  it('remembers who signed in, which is what turns a reload into a lock', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    expect(localStorage.getItem('evault.sesion')).toContain('ada@evault.test')
  })
})

describe('the 401 interceptor', () => {
  /**
   * Forces a response with the given status through the real client, so that the
   * response interceptors run as they do in the application.
   */
  async function requestReturning(state: number): Promise<void> {
    const originalAdapter = api.defaults.adapter

    api.defaults.adapter = async (config) => {
      const error = new AxiosError('Request failed') as AxiosError & {
        response: unknown
      }
      error.response = {
        status: state,
        statusText: '',
        data: {},
        headers: new AxiosHeaders(),
        config,
      }
      error.config = config

      throw error
    }

    try {
      await api.get('/loquesea')
    } catch {
      // the rejection is the case under test
    } finally {
      api.defaults.adapter = originalAdapter
    }
  }

  it('closes the session when the server answers 401', async () => {
    useSession.getState().authenticate(ADA, 'token-caducado')

    await requestReturning(401)

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().user).toBeNull()
  })

  /*
   * Only the 401 evicts. A 500 or a 422 are problems with the particular request and not
   * with the credential, and signing out over them would throw the user out every time
   * the server had a bad day.
   */
  it('does not close the session on other errors', async () => {
    useSession.getState().authenticate(ADA, 'token-bueno')

    await requestReturning(500)
    expect(useSession.getState().token).toBe('token-bueno')

    await requestReturning(422)
    expect(useSession.getState().token).toBe('token-bueno')
  })

  it('does nothing when there was no session left', async () => {
    await requestReturning(401)

    expect(useSession.getState().token).toBeNull()
  })
})

describe('the Authorization interceptor', () => {
  it('does not send the header with no session', async () => {
    const requestHeaders = await sentHeaders()

    expect(requestHeaders.Authorization).toBeUndefined()
  })

  it('sends the token as a Bearer when there is a session', async () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    const requestHeaders = await sentHeaders()

    expect(requestHeaders.Authorization).toBe('Bearer token-secreto')
  })

  /*
   * The token is read from the store on every request and not set once at startup. Were
   * it set, it would keep being sent after signing out and the server would receive a
   * revoked token on every call.
   */
  it('stops sending it after signing out', async () => {
    useSession.getState().authenticate(ADA, 'token-secreto')
    await sentHeaders()

    useSession.getState().clearSession()
    const requestHeaders = await sentHeaders()

    expect(requestHeaders.Authorization).toBeUndefined()
  })
})

/*
 * The migration of the persisted state, the only thing in this file that did not exist
 * before the migration to English (#116).
 *
 * The property stored in localStorage was called `usuarioRecordado` and is now called
 * `rememberedUser`. Without the store's `migrate`, whoever already used the application
 * would open the browser and find the blank sign-in form instead of their lock screen:
 * the data would still be there, but under a name the new code no longer looks for.
 *
 * It is not a failure that shows its face in development, because a fresh clone never
 * has the old format. That is why these tests write it by hand, and write it WITHOUT the
 * `version` field: that is exactly how it is stored today, because the store declared no
 * version when it was written. Inventing a `version: 0` would make the test pass while
 * leaving the failure alive.
 */
describe('migrating the remembered user', () => {
  /*
   * The file's beforeEach calls clearSession(), which deliberately does NOT forget the
   * remembered user: that is precisely the difference between locking and signing out.
   * Here one has to start from real zero, or the state left by the previous test covers
   * what is meant to be checked.
   */
  beforeEach(() => {
    useSession.setState({ rememberedUser: null })
  })

  it('recognises whoever was remembered under the format before English', async () => {
    localStorage.setItem(
      'evault.sesion',
      JSON.stringify({ state: { usuarioRecordado: { name: 'Ada', email: 'ada@evault.test' } } }),
    )

    await useSession.persist.rehydrate()

    expect(useSession.getState().rememberedUser).toEqual({
      name: 'Ada',
      email: 'ada@evault.test',
    })
  })

  it('does not invent a remembered user when nothing was stored', async () => {
    localStorage.clear()

    await useSession.persist.rehydrate()

    expect(useSession.getState().rememberedUser).toBeNull()
  })

  /*
   * The new format is not written by hand: the store itself is left to write it by
   * authenticating, and then it is checked that it knows how to read it back. Writing it
   * by hand would take assuming which version and which shape zustand uses inside, which
   * is exactly the assumption that made the first version of this fail.
   */
  it('still reads the format it writes itself', async () => {
    useSession.getState().authenticate(
      { ...ADA, name: 'Grace Hopper', email: 'grace@evault.test' },
      'un-token',
    )

    // What the store has just written. It is kept before emptying the state, because
    // emptying it also fires the persistence and would overwrite this.
    const written = localStorage.getItem('evault.sesion') ?? ''

    useSession.setState({ rememberedUser: null })
    localStorage.setItem('evault.sesion', written)

    await useSession.persist.rehydrate()

    expect(useSession.getState().rememberedUser).toEqual({
      name: 'Grace Hopper',
      email: 'grace@evault.test',
    })
  })
})
