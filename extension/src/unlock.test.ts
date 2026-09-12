import { describe, expect, it, vi } from 'vitest'
import { bytesToBase64, createVaultKey, derivePasskeyKeys, openVaultKey, randomBytes } from '@/lib/vault/crypto'
import { PasskeyUnsupported, type PasskeyAssertion } from '@/lib/vault/passkey'
import { ApiFailure, type PasskeySession } from './api'
import { UnlockFailed, unlock, type UnlockDependencies } from './unlock'

const EMAIL = 'ada@evault.test'
const INSTANCE = 'https://vault.example.ts.net'

/**
 * A passkey, a wrapper made with it and what the instance would answer, with the web's
 * real cryptography: the property under test is that the extension opens THAT wrapper.
 */
async function world() {
  const prf = randomBytes(32)
  const { wrapKey, authHash } = await derivePasskeyKeys(prf, EMAIL)
  const { vaultKey, wrapped } = await createVaultKey(wrapKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, new TextEncoder().encode('ok'))

  const assertion: PasskeyAssertion = { wrapKey, authHash, credentialId: bytesToBase64(randomBytes(8)) }
  const session: PasskeySession = { token: 'token-1', vaultId: 'vault-1', wrapped }

  const deps: UnlockDependencies & { [K in keyof UnlockDependencies]: ReturnType<typeof vi.fn> } = {
    assert: vi.fn().mockResolvedValue(assertion),
    exchange: vi.fn().mockResolvedValue(session),
    open: vi.fn(openVaultKey),
    revoke: vi.fn().mockResolvedValue(true),
  }

  return { deps, sealed, iv, authHash }
}

async function problemOf(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(UnlockFailed)
  return (error as UnlockFailed).problem
}

describe('unlocking from the extension', () => {
  it('opens the vault key the wrapper holds', async () => {
    const { deps, sealed, iv } = await world()

    const held = await unlock(EMAIL, INSTANCE, deps)

    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, held.key, sealed)
    expect(new TextDecoder().decode(opened)).toBe('ok')
    expect(held).toMatchObject({ token: 'token-1', vaultId: 'vault-1', email: EMAIL, instance: INSTANCE })
  })

  /*
   * THE ONE PARAMETER THAT DIFFERS FROM THE WEB (ADR-023 §2.5): the extension's own
   * hostname is its id, so it asks under the instance's.
   */
  it('asks the authenticator under the instance hostname', async () => {
    const { deps } = await world()

    await unlock(EMAIL, INSTANCE, deps)

    expect(deps.assert).toHaveBeenCalledWith(EMAIL, 'vault.example.ts.net')
  })

  it('sends the hash the passkey derived, and nothing else of it', async () => {
    const { deps, authHash } = await world()

    await unlock(EMAIL, INSTANCE, deps)

    expect(deps.exchange).toHaveBeenCalledWith(INSTANCE, EMAIL, authHash)
  })

  it('keeps the key non-extractable', async () => {
    const { deps } = await world()

    const held = await unlock(EMAIL, INSTANCE, deps)

    expect(held.key.extractable).toBe(false)
  })

  it('reads a dismissed dialog as cancelled, and asks nothing of the instance', async () => {
    const { deps } = await world()
    deps.assert.mockRejectedValue(new DOMException('dismissed', 'NotAllowedError'))

    expect(await problemOf(unlock(EMAIL, INSTANCE, deps))).toBe('cancelled')
    expect(deps.exchange).not.toHaveBeenCalled()
  })

  it('tells a browser without PRF apart', async () => {
    const { deps } = await world()
    deps.assert.mockRejectedValue(new PasskeyUnsupported())

    expect(await problemOf(unlock(EMAIL, INSTANCE, deps))).toBe('unsupported')
  })

  /*
   * ADR-019's distinction: only NO answer is «no connection». A 401 did reach the server;
   * reading it as offline would hide a removed passkey behind a wrong excuse.
   */
  it('reads no answer as offline, and only no answer', async () => {
    const { deps } = await world()

    deps.exchange.mockRejectedValue(new ApiFailure('no answer', null, true))
    expect(await problemOf(unlock(EMAIL, INSTANCE, deps))).toBe('offline')

    deps.exchange.mockRejectedValue(new ApiFailure('401', 401, false))
    expect(await problemOf(unlock(EMAIL, INSTANCE, deps))).toBe('refused')
  })

  it('reads the rate limit as throttled', async () => {
    const { deps } = await world()
    deps.exchange.mockRejectedValue(new ApiFailure('429', 429, false))

    expect(await problemOf(unlock(EMAIL, INSTANCE, deps))).toBe('throttled')
  })

  /*
   * A wrapper arrived and does not open — and a token was already issued with it. Leaving
   * that token alive would turn a failed unlock into a live session on the server.
   */
  it('revokes the token it was given when the wrapper does not open', async () => {
    const { deps } = await world()
    const { wrapKey: otherKey } = await derivePasskeyKeys(randomBytes(32), EMAIL)
    deps.assert.mockResolvedValue({ wrapKey: otherKey, authHash: 'h', credentialId: 'c' })

    expect(await problemOf(unlock(EMAIL, INSTANCE, deps))).toBe('mismatch')
    expect(deps.revoke).toHaveBeenCalledWith(INSTANCE, 'token-1')
  })
})
