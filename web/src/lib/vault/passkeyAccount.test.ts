import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { createVaultKey, decrypt, deriveKeys, encrypt, openVaultKey } from '@/lib/vault/crypto'
import { derivePasskeyKeys } from '@/lib/vault/crypto'
import { PasskeyUnsupported } from '@/lib/vault/passkey'
import { addPasskey, listPasskeys, revokePasskey } from '@/lib/vault/passkeyAccount'
import type { Encrypted } from '@/lib/vault/crypto'

/*
 * Managing the account's passkeys against the server. See ADR-021 and issue #561.
 *
 * This is the layer that joins the authenticator to the API, so what it has to get
 * right is the ORDER: everything cryptographic first, the request afterwards. It is the
 * order #59 established for saving an item, and it is what makes a wrong master password
 * fail without having sent anything.
 */

const EMAIL = 'ada@evault.test'
const PASSWORD = 'contraseña-larga-de-prueba'

const PRF_BYTES = new Uint8Array(
  Array.from({ length: 32 }, (_, index) => (index * 31 + 7) % 256),
)

let wrapped: Encrypted
let vaultKey: CryptoKey

/** An authenticator that returns the PRF straight away. */
function withAuthenticator(): void {
  const rawId = new Uint8Array([1, 2, 3, 4]).buffer
  const results = () => ({ prf: { enabled: true, results: { first: PRF_BYTES.buffer } } })

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    writable: true,
    value: {
      create: vi.fn(() => Promise.resolve({ rawId, getClientExtensionResults: results })),
      get: vi.fn(() => Promise.resolve({ rawId, getClientExtensionResults: results })),
    },
  })
}

beforeEach(async () => {
  const { masterKey } = await deriveKeys(PASSWORD, EMAIL)
  const created = await createVaultKey(masterKey)

  wrapped = created.wrapped
  vaultKey = created.vaultKey

  withAuthenticator()

  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      data: {
        vaults: [
          {
            id: 'vault-1',
            name: 'Personal',
            is_personal: true,
            role: 'owner',
            wrapped_key: wrapped.data,
            wrapped_key_iv: wrapped.iv,
          },
        ],
      },
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listing', () => {
  it('returns what the server sent', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: [{ id: 'p1', label: 'iPhone', rp_id: 'evault.local', created_at: null, last_used_at: null }] },
    })

    expect(await listPasskeys()).toHaveLength(1)
  })

  it('turns a failure into an error the screens already know', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('se cayó'))

    await expect(listPasskeys()).rejects.toBeDefined()
  })
})

describe('adding', () => {
  /*
   * THE TEST THAT MATTERS: what is sent has to be a wrapper the passkey opens. Anything
   * else — a wrapper made with the wrong key, or the ordinary one sent by mistake —
   * looks identical from here and fails on the day somebody tries to unlock.
   */
  it('sends a wrapper that the passkey opens, and nothing else', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
    const saved = await encrypt(vaultKey, 'la contraseña de GitHub')

    await addPasskey(EMAIL, PASSWORD, 'Mi iPhone')

    const body = post.mock.calls[0][1] as Record<string, string>

    expect(post.mock.calls[0][0]).toBe('/auth/passkeys')
    expect(body.label).toBe('Mi iPhone')
    expect(body.vault_id).toBe('vault-1')

    const { wrapKey } = await derivePasskeyKeys(PRF_BYTES, EMAIL)
    const opened = await openVaultKey(wrapKey, {
      data: body.wrapped_key,
      iv: body.wrapped_key_iv,
    })

    expect(await decrypt(opened, saved)).toBe('la contraseña de GitHub')
  })

  it('sends the hash the same PRF and email derive', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await addPasskey(EMAIL, PASSWORD, 'Mi iPhone')

    const body = post.mock.calls[0][1] as Record<string, string>
    const { authHash } = await derivePasskeyKeys(PRF_BYTES, EMAIL)

    expect(body.auth_hash).toBe(authHash)
  })

  it('reports the hostname the credential was registered under', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await addPasskey(EMAIL, PASSWORD, 'Mi iPhone')

    expect((post.mock.calls[0][1] as Record<string, string>).rp_id).toBe(location.hostname)
  })

  /*
   * The order of #59: encrypt first, request after. With the wrong master password the
   * wrapper cannot be made, and nothing must have been sent by then — a passkey
   * registered against a wrapper that opens nothing is a passkey that fails on the day
   * it is needed.
   */
  it('sends nothing when the master password is wrong', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await expect(addPasskey(EMAIL, 'esa-no-es', 'Mi iPhone')).rejects.toBeDefined()

    expect(post).not.toHaveBeenCalled()
  })

  it('sends nothing when the browser has no PRF', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        create: vi.fn(() =>
          Promise.resolve({
            rawId: new Uint8Array([1]).buffer,
            getClientExtensionResults: () => ({}),
          }),
        ),
      },
    })

    await expect(addPasskey(EMAIL, PASSWORD, 'Mi iPhone')).rejects.toBeInstanceOf(
      PasskeyUnsupported,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses when the account has no vault to wrap', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [] } } })

    await expect(addPasskey(EMAIL, PASSWORD, 'Mi iPhone')).rejects.toThrow(/vault/i)
  })

  it('turns a rejected request into an error the screens already know', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('se cayó'))

    await expect(addPasskey(EMAIL, PASSWORD, 'Mi iPhone')).rejects.toBeDefined()
  })
})

describe('revoking', () => {
  it('asks the server to remove that one', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })

    await revokePasskey('passkey-1')

    expect(remove).toHaveBeenCalledWith('/auth/passkeys/passkey-1')
  })

  it('turns a failure into an error the screens already know', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new Error('se cayó'))

    await expect(revokePasskey('passkey-1')).rejects.toBeDefined()
  })
})
