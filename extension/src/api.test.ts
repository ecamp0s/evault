import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiFailure, revokeToken, unlockWithPasskeyHash } from './api'

const INSTANCE = 'https://vault.test'

function answer(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

const SESSION = {
  data: { user: {}, token: 't', vault_id: 'v', wrapped_key: 'w', wrapped_key_iv: 'i' },
}

describe('the requests of the extension', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exchanges the hash for a session', async () => {
    const fetch = answer(200, SESSION)
    vi.stubGlobal('fetch', fetch)

    const session = await unlockWithPasskeyHash(INSTANCE, 'ada@evault.test', 'hash')

    expect(session).toEqual({ token: 't', vaultId: 'v', wrapped: { data: 'w', iv: 'i' } })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://vault.test/api/auth/passkey')
    expect(JSON.parse(init.body)).toEqual({ email: 'ada@evault.test', auth_hash: 'hash' })
  })

  it('keeps the status of an answer that is not a success', async () => {
    vi.stubGlobal('fetch', answer(401, { message: 'no' }))

    const error = await unlockWithPasskeyHash(INSTANCE, 'a', 'h').catch((caught) => caught)

    expect(error).toBeInstanceOf(ApiFailure)
    expect(error).toMatchObject({ status: 401, isNetwork: false })
  })

  it('marks as network only the case where nothing came back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await unlockWithPasskeyHash(INSTANCE, 'a', 'h').catch((caught) => caught)

    expect(error).toMatchObject({ status: null, isNetwork: true })
  })

  /*
   * A missing field would reach AES-GCM as undefined and fail as a decryption error —
   * «this passkey does not open this vault» — when the instance answered something else.
   */
  it('refuses a success that carries no session', async () => {
    vi.stubGlobal('fetch', answer(200, { data: { token: 't' } }))

    const error = await unlockWithPasskeyHash(INSTANCE, 'a', 'h').catch((caught) => caught)

    expect(error).toMatchObject({ status: 200, isNetwork: false })
  })

  it('revokes a token with its bearer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    expect(await revokeToken(INSTANCE, 'token-1')).toBe(true)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://vault.test/api/auth/logout')
    expect(init.headers.Authorization).toBe('Bearer token-1')
  })

  it('never throws when revoking fails, because a lock must not stop half-way', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    expect(await revokeToken(INSTANCE, 'token-1')).toBe(false)
  })
})
