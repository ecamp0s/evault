import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PRF_SALT,
  PasskeyUnsupported,
  assertPasskey,
  registerPasskey,
} from '@/lib/vault/passkey'
import { unlockVaultWithPasskey } from '@/lib/vault/unlock'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import {
  createVaultKey,
  decrypt,
  derivePasskeyKeys,
  deriveKeys,
  encrypt,
  openVaultKey,
  DecryptionError,
} from '@/lib/vault/crypto'

const EMAIL = 'ada@evault.test'

/** The 32 bytes a real authenticator would return. Fixed so the tests repeat. */
const PRF_BYTES = new Uint8Array(
  Array.from({ length: 32 }, (_, index) => (index * 31 + 7) % 256),
)

interface FakeAuthenticator {
  /** Every options object passed to navigator.credentials.create. */
  created: PublicKeyCredentialCreationOptions[]
  /** Every options object passed to navigator.credentials.get. */
  asserted: PublicKeyCredentialRequestOptions[]
}

/**
 * Stands in for an authenticator, which jsdom has none of.
 *
 * WHAT THIS CAN AND CANNOT PROVE, said up front because it decides what these tests are
 * worth. It proves what we ASK the authenticator for and what we do with the answer,
 * which is where every property of ADR-021 that lives in our code sits. It proves
 * nothing about whether a real authenticator honours it — no fake can, and that is why
 * #566 puts a virtual authenticator with PRF behind CDP and #568 ends up on a real
 * iPhone.
 *
 * `prf` says what the extension reports: 'bytes' returns them whenever asked, 'later'
 * reports enabled at registration and only yields bytes on an assertion, and 'none' is
 * a browser without the extension.
 *
 * NOTE THAT AN ASSERTION YIELDS BYTES IN BOTH OF THE FIRST TWO, which is not a detail of
 * the fake but of the thing it stands for: the two-step case is about REGISTRATION not
 * carrying them. Unlocking always goes through an assertion, so modelling `get` as the
 * poor relation — which is how this started, written while only registration existed —
 * made every unlock test fail for a reason that has nothing to do with unlocking.
 */
function withAuthenticator(
  prf: 'bytes' | 'later' | 'none' = 'bytes',
): FakeAuthenticator {
  const record: FakeAuthenticator = { created: [], asserted: [] }
  const rawId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer

  const results = (withBytes: boolean) => () =>
    prf === 'none'
      ? {}
      : {
          prf: {
            enabled: true,
            ...(withBytes ? { results: { first: PRF_BYTES.buffer } } : {}),
          },
        }

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    writable: true,
    value: {
      create: vi.fn((options: CredentialCreationOptions) => {
        record.created.push(options.publicKey as PublicKeyCredentialCreationOptions)

        return Promise.resolve({
          rawId,
          getClientExtensionResults: results(prf === 'bytes'),
        })
      }),
      get: vi.fn((options: CredentialRequestOptions) => {
        record.asserted.push(options.publicKey as PublicKeyCredentialRequestOptions)

        return Promise.resolve({
          rawId,
          getClientExtensionResults: results(prf !== 'none'),
        })
      }),
    },
  })

  return record
}

/** A vault, as the account would already have it before adding a passkey. */
async function anExistingVault() {
  const { masterKey } = await deriveKeys('contraseña-muy-larga', EMAIL)

  return { masterKey, ...(await createVaultKey(masterKey)) }
}

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * THE TESTS THAT PROTECT THE DECISION, and they go first because the rest of the file
 * is mechanics. ADR-021 §2.4 argues that the server need not verify WebAuthn, and the
 * whole argument rests on the authenticator having verified the user. That property is
 * one word in one options object, and nothing else in the project would notice if it
 * disappeared.
 */
describe('what the authenticator is asked for', () => {
  it('demands user verification, which is what makes the PRF prove a person was there', async () => {
    const authenticator = withAuthenticator()
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(authenticator.created[0].authenticatorSelection?.userVerification).toBe(
      'required',
    )
  })

  it('demands a discoverable credential, so a device that never registered it can find it', async () => {
    const authenticator = withAuthenticator()
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(authenticator.created[0].authenticatorSelection?.residentKey).toBe('required')
  })

  /*
   * THE LITERAL STRING AND NOT THE CONSTANT, which is the whole point of this test.
   *
   * Written as `toBe(PRF_SALT)` it passes with any value, because the expectation moves
   * with the thing it is meant to pin — the failure ADR-018 §4 warns about and that the
   * nineteen tests built on SHORT_BELOW already cost this project once. Measured here
   * too: changing the salt to `-v2` left all thirteen tests green.
   *
   * And this one is worth pinning above almost anything else in the file. The salt is an
   * input to the authenticator, so a different value is a different 32 bytes, and every
   * wrapper already stored stops opening. There is no migration for that: nobody can
   * re-derive the old bytes.
   */
  it('evaluates the PRF with the salt of this project and no other', async () => {
    const authenticator = withAuthenticator()
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    const asked = authenticator.created[0].extensions as unknown as {
      prf: { eval: { first: Uint8Array } }
    }

    expect(new TextDecoder().decode(asked.prf.eval.first)).toBe('evault-passkey-prf-v1')
    expect(PRF_SALT).toBe('evault-passkey-prf-v1')
  })

  /*
   * A constant challenge would work just as well, since nobody verifies it, and that is
   * exactly why this test exists: the moment it stops being random is the moment
   * something downstream can start depending on its value.
   */
  it('sends a different challenge every time', async () => {
    const authenticator = withAuthenticator()
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)
    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    const [first, second] = authenticator.created.map(
      (options) => new Uint8Array(options.challenge as ArrayBuffer),
    )

    expect(Array.from(first)).not.toEqual(Array.from(second))
  })
})

/*
 * THE TEST THAT JUSTIFIES THE FILE, in the shape recoveryKey.test.ts uses for the
 * recovery key: that the credential is registered neatly counts for nothing if the
 * wrapper it produces does not open the vault.
 */
describe('the complete path', () => {
  it('the wrapper it produces opens the same vault key', async () => {
    withAuthenticator()
    const vault = await anExistingVault()

    const saved = await encrypt(vault.vaultKey, 'la contraseña de GitHub')

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    // From here on the master key is nowhere in sight, which is the point.
    const { wrapKey } = await derivePasskeyKeys(PRF_BYTES, EMAIL)
    const opened = await openVaultKey(wrapKey, registered.wrappedKey)

    expect(await decrypt(opened, saved)).toBe('la contraseña de GitHub')
  })

  it('the hash it returns is the one that PRF and email derive', async () => {
    withAuthenticator()
    const vault = await anExistingVault()

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)
    const { authHash } = await derivePasskeyKeys(PRF_BYTES, EMAIL)

    expect(registered.authHash).toBe(authHash)
  })

  /*
   * The name the credential belongs to, which is the whole of #578 in one field. Without
   * it the screen cannot tell somebody why a passkey registered through one name does
   * not appear under the other, and «it vanished» is the worst thing a vault can say.
   */
  it('reports the hostname the credential was registered under', async () => {
    withAuthenticator()
    const vault = await anExistingVault()

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(registered.rpId).toBe(location.hostname)
  })

  it('registers against the hostname it reports, and not some other', async () => {
    const authenticator = withAuthenticator()
    const vault = await anExistingVault()

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(authenticator.created[0].rp.id).toBe(registered.rpId)
  })

  it('the credential id comes back as base64 of what the authenticator gave', async () => {
    withAuthenticator()
    const vault = await anExistingVault()

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(registered.credentialId).toBe(btoa('\x01\x02\x03\x04\x05\x06\x07\x08'))
  })
})

/*
 * The authenticator that reports the extension but hands over no bytes until the next
 * assertion. Apple's own tooling documents this outcome, and taking `enabled: true` for
 * the bytes would derive from undefined — a wrapper nobody could ever open.
 */
describe('when the bytes only arrive on the second ask', () => {
  it('asks once more instead of giving up', async () => {
    const authenticator = withAuthenticator('later')
    const vault = await anExistingVault()

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)
    const { authHash } = await derivePasskeyKeys(PRF_BYTES, EMAIL)

    expect(authenticator.asserted).toHaveLength(1)
    expect(registered.authHash).toBe(authHash)
  })

  it('names the credential explicitly, instead of offering a choice', async () => {
    const authenticator = withAuthenticator('later')
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(authenticator.asserted[0].allowCredentials).toHaveLength(1)
  })

  it('demands user verification on that second ask too', async () => {
    const authenticator = withAuthenticator('later')
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(authenticator.asserted[0].userVerification).toBe('required')
  })

  it('does not ask twice when the bytes came the first time', async () => {
    const authenticator = withAuthenticator('bytes')
    const vault = await anExistingVault()

    await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    expect(authenticator.asserted).toHaveLength(0)
  })
})

describe('when the browser cannot do this', () => {
  it('fails with its own error and not with a decryption failure', async () => {
    withAuthenticator('none')
    const vault = await anExistingVault()

    await expect(
      registerPasskey(EMAIL, vault.masterKey, vault.wrapped),
    ).rejects.toBeInstanceOf(PasskeyUnsupported)
  })

  /*
   * A null credential is not supposed to happen — the API either resolves with one or
   * rejects — and it is covered anyway because the alternative is worse than an unused
   * branch: without the guard, `credential.rawId` would throw a TypeError, and a
   * TypeError out of this module is indistinguishable from a bug in it.
   */
  it('treats a credential that never arrived as something this device cannot do', async () => {
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: { create: vi.fn(() => Promise.resolve(null)) },
    })

    const vault = await anExistingVault()

    await expect(
      registerPasskey(EMAIL, vault.masterKey, vault.wrapped),
    ).rejects.toBeInstanceOf(PasskeyUnsupported)
  })

  /*
   * The authenticator that promises bytes on the next assertion and then does not
   * deliver. It is the case that would otherwise derive from undefined and store a
   * wrapper nobody can open — a failure that shows up not now but on the day somebody
   * tries to unlock with it.
   */
  it('fails instead of deriving from nothing when the second ask yields no bytes', async () => {
    const rawId = new Uint8Array([1, 2, 3]).buffer

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        create: vi.fn(() =>
          Promise.resolve({
            rawId,
            getClientExtensionResults: () => ({ prf: { enabled: true } }),
          }),
        ),
        get: vi.fn(() =>
          Promise.resolve({ rawId, getClientExtensionResults: () => ({}) }),
        ),
      },
    })

    const vault = await anExistingVault()

    await expect(
      registerPasskey(EMAIL, vault.masterKey, vault.wrapped),
    ).rejects.toBeInstanceOf(PasskeyUnsupported)
  })

  it('fails the same way when the second ask returns no credential at all', async () => {
    const rawId = new Uint8Array([1, 2, 3]).buffer

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        create: vi.fn(() =>
          Promise.resolve({
            rawId,
            getClientExtensionResults: () => ({ prf: { enabled: true } }),
          }),
        ),
        get: vi.fn(() => Promise.resolve(null)),
      },
    })

    const vault = await anExistingVault()

    await expect(
      registerPasskey(EMAIL, vault.masterKey, vault.wrapped),
    ).rejects.toBeInstanceOf(PasskeyUnsupported)
  })

  /*
   * Cancelling the dialog is NOT a limitation, and the two must not arrive as the same
   * thing: one deserves an explanation of what the device cannot do, the other deserves
   * silence. The platform throws NotAllowedError and this checks it travels through
   * untouched.
   */
  it('lets a cancelled dialog through as the error the platform threw', async () => {
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        create: vi.fn(() =>
          Promise.reject(new DOMException('cancelado', 'NotAllowedError')),
        ),
      },
    })

    const vault = await anExistingVault()
    const failure = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(DOMException)
    expect((failure as DOMException).name).toBe('NotAllowedError')
    expect(failure).not.toBeInstanceOf(PasskeyUnsupported)
  })
})

/*
 * UNLOCKING, which is the half of ADR-021 that gets used every day. Registration
 * happens once; this runs every time the vault is opened.
 */
describe('unlocking with a passkey', () => {
  it('derives the same pair the registration derived', async () => {
    withAuthenticator()

    const { authHash } = await assertPasskey(EMAIL)
    const expected = await derivePasskeyKeys(PRF_BYTES, EMAIL)

    expect(authHash).toBe(expected.authHash)
  })

  /*
   * NO allowCredentials, and it is the criterion 2 of the iteration written as a test.
   * On a device where the passkey was synced but never registered there is no id to
   * name, so naming one would make that device unable to unlock — which is exactly what
   * keeping the wrapper on the server was for.
   */
  it('lets the browser offer whatever passkey it has, instead of naming one', async () => {
    const authenticator = withAuthenticator()

    await assertPasskey(EMAIL)

    expect(authenticator.asserted[0].allowCredentials).toBeUndefined()
  })

  it('demands user verification, like every other path to the PRF', async () => {
    const authenticator = withAuthenticator()

    await assertPasskey(EMAIL)

    expect(authenticator.asserted[0].userVerification).toBe('required')
  })

  it('asks under the hostname the passkey belongs to', async () => {
    const authenticator = withAuthenticator()

    await assertPasskey(EMAIL)

    expect(authenticator.asserted[0].rpId).toBe(location.hostname)
  })

  /*
   * The browser extension's case (ADR-023 §2.5): its own hostname is an extension id, so
   * it names the instance. Everything else — the salt, user verification, no credential
   * named — has to stay exactly as it is for the web, which is why it is the same function.
   */
  it('asks under the RP ID it is given, and changes nothing else', async () => {
    const authenticator = withAuthenticator()

    const { authHash } = await assertPasskey(EMAIL, 'vault.example.ts.net')
    const [asked] = authenticator.asserted

    expect(asked.rpId).toBe('vault.example.ts.net')
    expect(asked.userVerification).toBe('required')
    expect(asked.allowCredentials).toBeUndefined()
    expect(authHash).toBe((await derivePasskeyKeys(PRF_BYTES, EMAIL)).authHash)
  })

  it('fails with its own error when the browser has no PRF', async () => {
    withAuthenticator('none')

    await expect(assertPasskey(EMAIL)).rejects.toBeInstanceOf(PasskeyUnsupported)
  })
})

/*
 * THE TEST THAT JOINS THE TWO HALVES, and the one that would catch almost anything
 * either of them got wrong: register a passkey, throw away the master key, and open the
 * vault with nothing but the authenticator.
 *
 * It is the shape recoveryKey.test.ts uses for the recovery key, and for the same
 * reason — on the day this matters there is no second chance.
 */
describe('the complete path, from registering to unlocking', () => {
  it('opens the vault with the passkey and no master password', async () => {
    withAuthenticator()
    const vault = await anExistingVault()
    const saved = await encrypt(vault.vaultKey, 'la contraseña de GitHub')

    const registered = await registerPasskey(EMAIL, vault.masterKey, vault.wrapped)

    // From here on: no master key, no master password. Only the authenticator.
    useVaultKey.getState().forget()
    const { wrapKey } = await assertPasskey(EMAIL)
    await unlockVaultWithPasskey(wrapKey, registered.wrappedKey)

    const inMemory = useVaultKey.getState().key

    expect(inMemory).not.toBeNull()
    expect(await decrypt(inMemory!, saved)).toBe('la contraseña de GitHub')
  })

  /*
   * A wrapper this passkey did not close fails exactly as a wrong master password does,
   * through the same openVaultKey and on the same kind of bytes. If this ever starts
   * throwing something else, a second code path has appeared.
   */
  it('a wrapper that belongs to another key fails as a decryption error', async () => {
    withAuthenticator()
    const somebodyElse = await deriveKeys('otra-contraseña-larga', EMAIL)
    const theirVault = await createVaultKey(somebodyElse.masterKey)

    const { wrapKey } = await assertPasskey(EMAIL)

    await expect(
      unlockVaultWithPasskey(wrapKey, theirVault.wrapped),
    ).rejects.toBeInstanceOf(DecryptionError)
  })

  /*
   * Dismissing Face ID must leave the application exactly where it was. A vault that is
   * half unlocked is worse than one that is locked: the interface would show itself as
   * open over a key that cannot decrypt anything.
   */
  it('a cancelled dialog leaves the vault locked and nothing half done', async () => {
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        get: vi.fn(() => Promise.reject(new DOMException('cancelado', 'NotAllowedError'))),
      },
    })

    useVaultKey.getState().forget()

    const failure = await assertPasskey(EMAIL).catch((error: unknown) => error)

    expect((failure as DOMException).name).toBe('NotAllowedError')
    expect(failure).not.toBeInstanceOf(PasskeyUnsupported)
    expect(useVaultKey.getState().key).toBeNull()
  })
})
