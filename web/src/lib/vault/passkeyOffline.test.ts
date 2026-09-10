import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import {
  createVaultKey,
  decrypt,
  derivePasskeyKeys,
  deriveKeys,
  encrypt,
  rewrap,
} from '@/lib/vault/crypto'
import {
  cacheItems,
  cachePasskey,
  cacheVaultKey,
  forgetCachedPasskey,
  readCachedAccount,
} from '@/lib/vault/deviceCache'
import { useOfflinePreference } from '@/lib/vault/offlinePreference'
import { addPasskey, revokePasskey, unlockWithPasskey } from '@/lib/vault/passkeyAccount'
import type { Encrypted } from '@/lib/vault/crypto'

/*
 * Unlocking with a passkey when the server does not answer. See ADR-019, ADR-021 and
 * issue #564.
 *
 * THE COMBINATION THIS FILE EXISTS FOR is the one that fails silently: a passkey that
 * works with network and not without it. The place where unlocking fast matters most is
 * the phone, and the phone is what loses its network — so a shortcut that only works
 * online is a shortcut that is missing exactly when it was wanted.
 */

const EMAIL = 'ada@evault.test'
const PASSWORD = 'contraseña-larga-de-prueba'
const CREDENTIAL = 'la-credencial-de-este-aparato'

const PRF_BYTES = new Uint8Array(
  Array.from({ length: 32 }, (_, index) => (index * 31 + 7) % 256),
)

let wrapped: Encrypted
let vaultKey: CryptoKey

/** An authenticator that answers with the PRF and with this device's credential id. */
function withAuthenticator(): void {
  const rawId = Uint8Array.from(atob(CREDENTIAL_B64), (c) => c.charCodeAt(0)).buffer
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

const CREDENTIAL_B64 = btoa(CREDENTIAL)

/**
 * The server not answering at all, which is the only case that may fall back.
 *
 * `isNetwork` is a getter over `state === null`, so a null state IS the no-answer case.
 * Forcing the flag on top would be describing the condition instead of producing it —
 * and it throws, which is how this got noticed.
 */
const noAnswer = () => new AxiosError('Network Error')

/**
 * The server answering, with a status.
 *
 * AN AxiosError AND NOT AN ApiError, and the difference is not cosmetic: `interpretError`
 * turns anything that is not an AxiosError into an ApiError with a null state — which IS
 * the no-answer case. A test throwing the wrong type therefore lands in the cache branch
 * and passes for the wrong reason. This one failed loudly instead, which is better.
 */
function answeredWith(status: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status, statusText: '', data: {}, headers, config: { headers } }

  return error
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange

  const { masterKey } = await deriveKeys(PASSWORD, EMAIL)
  const created = await createVaultKey(masterKey)

  wrapped = created.wrapped
  vaultKey = created.vaultKey

  const { wrapKey } = await derivePasskeyKeys(PRF_BYTES, EMAIL)
  const forPasskey = await rewrap(masterKey, wrapped, wrapKey)

  /*
   * The whole record and not just the passkey wrapper, because `readCachedAccount`
   * answers null without BOTH halves — a record with a key and no items cannot open
   * anything, and answering it as a cache would turn «there is nothing here» into a
   * decryption failure further down.
   *
   * So a passkey wrapper on its own is not an offline vault, and that is the right
   * behaviour: with no items there is nothing to open.
   */
  await cacheVaultKey(EMAIL, {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.data,
    wrapped_key_iv: wrapped.iv,
  })
  await cacheItems(EMAIL, [])
  await cachePasskey(EMAIL, {
    credentialId: CREDENTIAL_B64,
    wrappedKey: forPasskey.data,
    wrappedKeyIv: forPasskey.iv,
  })

  useSession.setState({
    user: null,
    token: null,
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })
  useVaultKey.setState({ key: null })
  useOfflinePreference.setState({ enabled: true })

  withAuthenticator()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

describe('with no answer from the server', () => {
  it('opens the vault from the copy on this device', async () => {
    const saved = await encrypt(vaultKey, 'la contraseña de GitHub')

    vi.spyOn(api, 'post').mockRejectedValue(noAnswer())

    await unlockWithPasskey()

    expect(useVaultKey.getState().key).not.toBeNull()
    expect(await decrypt(useVaultKey.getState().key!, saved)).toBe('la contraseña de GitHub')
  })

  it('marks the session as offline, so writing refuses before sending anything', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(noAnswer())

    await unlockWithPasskey()

    expect(useSession.getState().offline).toBe(true)
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * ONE REQUEST AND NO MORE: the one that failed. Everything after it happens on this
   * device, which is the claim `openFromCache` makes and the reason it needs nobody's
   * permission — the wrapper and the ciphertext are already here.
   *
   * A second call would mean something in the offline path still reaches for the server,
   * and that is the failure that only shows up with no network: the exact conditions
   * this exists for.
   */
  it('speaks to nobody once it has fallen back', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(noAnswer())
    const get = vi.spyOn(api, 'get')
    const remove = vi.spyOn(api, 'delete')

    await unlockWithPasskey()

    expect(post).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  /*
   * A 401 or a 429 ARE answers, and falling back on them would turn a passkey the
   * account revoked into one that still opens the vault, and a rate limit into a way
   * around it. The same distinction `logIn` makes, and the same reason for pinning it:
   * getting it wrong would be invisible, because everything would keep working.
   */
  it('does not fall back when the server DID answer', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(answeredWith(401))

    await expect(unlockWithPasskey()).rejects.toBeDefined()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('reports the lack of network when this device has no wrapper for it', async () => {
    vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })
    await revokePasskey('cualquiera')
    vi.spyOn(api, 'post').mockRejectedValue(noAnswer())

    const failure = await unlockWithPasskey().catch((error: unknown) => error)

    expect((failure as Error).message).toMatch(/no hay conexión/i)
  })
})

describe('what this device keeps', () => {
  /*
   * IT STARTS BY TAKING THE SEEDED WRAPPER AWAY, and that line is the point rather than
   * setup noise. Written without it, this asserted a state `beforeEach` had already
   * produced: removing the very write it protects left it green. Caught by mutation, and
   * it is the failure ADR-018 §4 describes wearing another face — an expectation
   * satisfied by something other than the thing under test.
   */
  it('keeps the wrapper when a passkey is registered', async () => {
    await forgetCachedPasskey(EMAIL, CREDENTIAL_B64)
    expect((await readCachedAccount(EMAIL))?.passkeys ?? []).toHaveLength(0)

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
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await addPasskey(EMAIL, PASSWORD, 'Este aparato')

    // Two: the one seeded above and the one just registered, which uses another
    // credential id only if the authenticator says so — here it is the same, so one.
    expect((await readCachedAccount(EMAIL))?.passkeys).toHaveLength(1)
  })

  /*
   * Revoking has to reach here too. A wrapper left behind means a credential the account
   * no longer recognises still opening the vault on this device whenever the server is
   * unreachable — which is the state somebody revoking is trying to end.
   */
  it('takes the wrapper away when the passkey is revoked', async () => {
    vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })

    await revokePasskey('passkey-1')

    expect((await readCachedAccount(EMAIL))?.passkeys ?? []).toHaveLength(0)
  })

  /*
   * REPLACING BY CREDENTIAL AND NOT APPENDING. Registering the same credential twice —
   * which happens when somebody re-adds a device — must leave one wrapper and not two,
   * because the second would be a stale wrapper of the same key that nothing ever
   * removes.
   */
  it('replaces the wrapper of a credential instead of piling another on', async () => {
    await cachePasskey(EMAIL, {
      credentialId: CREDENTIAL_B64,
      wrappedKey: 'el-segundo-envoltorio',
      wrappedKeyIv: 'otro-nonce',
    })

    const kept = (await readCachedAccount(EMAIL))?.passkeys ?? []

    expect(kept).toHaveLength(1)
    expect(kept[0].wrappedKey).toBe('el-segundo-envoltorio')
  })

  /*
   * REVOKING WITHOUT KNOWING WHICH CREDENTIAL SWEEPS THEM ALL, and that is the blunt
   * answer on purpose: the screen revokes by the server's id and has no credential id to
   * hand — #559 keeps the listing down to what it needs. There is no way to tell from
   * here which cached wrapper just stopped being valid, and erring the other way would
   * leave a revoked passkey opening the vault offline.
   *
   * It costs nothing that matters: the next unlock with a passkey that is still good
   * puts its wrapper back.
   */
  it('sweeps every wrapper when it cannot tell which one was revoked', async () => {
    await cachePasskey(EMAIL, {
      credentialId: 'la-de-otro-aparato',
      wrappedKey: 'su-envoltorio',
      wrappedKeyIv: 'su-nonce',
    })
    expect((await readCachedAccount(EMAIL))?.passkeys).toHaveLength(2)

    vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })

    await revokePasskey('passkey-1')

    expect((await readCachedAccount(EMAIL))?.passkeys ?? []).toHaveLength(0)
  })

  it('does not keep anything when this device was not asked to', async () => {
    await forgetCachedPasskey(EMAIL, CREDENTIAL_B64)
    useOfflinePreference.setState({ enabled: false })

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
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await addPasskey(EMAIL, PASSWORD, 'Otro aparato')


    expect((await readCachedAccount(EMAIL))?.passkeys ?? []).toHaveLength(0)
  })
})
