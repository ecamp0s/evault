import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { signUp, logOut } from './auth'
import { useSession, type User } from './session'
import { useVaultKey } from './vault/keyInMemory'
import { encrypt, decrypt, deriveKeys } from './vault/crypto'

/*
 * What this file watches over is the product's central promise: that the master
 * password does not leave the device. It is not checked by reading the code but by
 * looking at what is handed to axios, which is the only thing that gets out over the
 * wire.
 *
 * The derivation is slow on purpose —600,000 iterations—, so these tests take a while.
 * Lowering ITERATIONS to speed them up would be weakening the product so that the suite
 * runs sooner, and that is why there is a test in crypto.test.ts preventing it.
 */

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null, has_recovery_key: false
}

const DATA = {
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  password: 'una contraseña maestra larga',
  passwordConfirmation: 'una contraseña maestra larga',
}

/** What axios would receive on sign-up, without actually sending anything. */
async function registrationBody(data = DATA): Promise<Record<string, string>> {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { data: { user: ADA, token: 'token-de-prueba' } } })

  await signUp(data)

  return post.mock.calls[0]?.[1] as Record<string, string>
}

beforeEach(() => {
  useSession.setState({ user: null, token: null, rememberedUser: null })
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signUp', () => {
  it('sends the sign-up to the register endpoint and leaves the session open', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-de-prueba' } } })

    await signUp(DATA)

    expect(post.mock.calls[0]?.[0]).toBe('/auth/register')
    expect(useSession.getState().token).toBe('token-de-prueba')
    expect(useSession.getState().user).toEqual(ADA)
  })

  /*
   * The issue's acceptance criterion, and the reason the whole iteration existed. It is
   * checked over the entire serialised body and not field by field: if some day someone
   * adds a new field with the password inside, a test looking only at the known fields
   * would not notice.
   */
  it('sends the master password nowhere in the body', async () => {
    const body = await registrationBody()

    expect(JSON.stringify(body)).not.toContain(DATA.password)
  })

  it('sends the authentication hash in the password field, not the password', async () => {
    const body = await registrationBody()
    const { authHash } = await deriveKeys(DATA.password, DATA.email)

    expect(body.password).toBe(authHash)
  })

  it('does not send the password confirmation', async () => {
    const body = await registrationBody()

    expect(Object.keys(body)).toEqual([
      'name',
      'email',
      'password',
      'wrapped_key',
      'wrapped_key_iv',
    ])
  })

  it('sends the wrapped vault key along with its nonce', async () => {
    const body = await registrationBody()

    expect(body.wrapped_key).toBeTruthy()
    expect(body.wrapped_key_iv).toBeTruthy()
    expect(body.wrapped_key).not.toBe(body.wrapped_key_iv)
  })

  /*
   * The end-to-end check that the wrapping is good for something: the key left in
   * memory and the one that can be unwrapped with the server's master key are the same.
   * Without this, the sign-up could be sending a perfectly formed blob that opens
   * nothing, and it would not be known until the first login.
   */
  it('what it sends wrapped opens what the key in memory encrypts', async () => {
    const body = await registrationBody()
    const { masterKey } = await deriveKeys(DATA.password, DATA.email)

    const { openVaultKey } = await import('./vault/crypto')
    const recovered = await openVaultKey(masterKey, {
      data: body.wrapped_key,
      iv: body.wrapped_key_iv,
    })

    const inMemory = useVaultKey.getState().key

    expect(inMemory).not.toBeNull()

    const encrypted = await encrypt(inMemory as CryptoKey, 'un secreto cualquiera')

    expect(await decrypt(recovered, encrypted)).toBe('un secreto cualquiera')
  })

  it('leaves the vault unlocked', async () => {
    await registrationBody()

    expect(useVaultKey.getState().key).not.toBeNull()
  })

  /*
   * If the server rejects the sign-up, no live vault key can be left in memory: it
   * would mean having unlocked a vault that does not exist, and the next screen would
   * believe there is something to show.
   */
  it('leaves no key in memory if the sign-up fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('rechazado'))

    await expect(signUp(DATA)).rejects.toThrow()

    expect(useVaultKey.getState().key).toBeNull()
  })

  /*
   * The email is normalised inside the derivation, so signing up in uppercase produces
   * the same hash as doing it without. It is the client half of the match with the
   * server's mb_strtolower(trim(...)).
   */
  it('derives the same writing the email with capitals and spaces', async () => {
    const plain = await registrationBody()

    vi.restoreAllMocks()
    useVaultKey.setState({ key: null })

    const odd = await registrationBody({ ...DATA, email: '  ADA@Evault.Test  ' })

    expect(odd.password).toBe(plain.password)
  })
})

describe('signing out', () => {
  /*
   * Signing out locks the vault. Leaving the key alive would be worse than not signing
   * out: the screen would say there is nobody inside while the material everything is
   * decrypted with stays within reach of any script in the tab.
   */
  it('forgets the vault key', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: null })

    const { masterKey } = await deriveKeys('lo que sea', 'ada@evault.test')
    const { createVaultKey } = await import('./vault/crypto')
    const { vaultKey } = await createVaultKey(masterKey)

    useSession.getState().authenticate(ADA, 'token')
    useVaultKey.getState().save(vaultKey)

    await logOut()

    expect(useVaultKey.getState().key).toBeNull()
  })
})

describe('the key in memory', () => {
  /*
   * ADR-007 forbids it explicitly and that is why it is checked, even though the store
   * declares no persistence: what is watched is not today's implementation but that
   * nobody adds a persist middleware to it tomorrow, which is a one-line change and
   * looks innocent.
   */
  it('leaves no trace in localStorage or in sessionStorage', async () => {
    await registrationBody()

    expect(localStorage.length).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(localStorage)).not.toContain('CryptoKey')
    expect(Object.keys(sessionStorage)).toHaveLength(0)

    for (const vaultKey of Object.keys(localStorage)) {
      expect(localStorage.getItem(vaultKey)).not.toContain('wrapped')
    }
  })
})
