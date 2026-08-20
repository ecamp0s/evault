import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'
import { changeMasterPassword } from './masterPassword'
import {
  createVaultKey,
  decrypt,
  DecryptionError,
  deriveKeys,
  encrypt,
  openVaultKey,
  type DerivedKeys,
  type Encrypted,
} from './crypto'
import type { Vault } from './types'

/*
 * This file covers `changeMasterPassword`, which sat at ZERO of 40 lines until issue
 * 217. Its screen was covered, but by substituting this function with `vi.spyOn`, so
 * what decides whether somebody loses access to their vault ran in no test in the
 * repository. Worse: issue 202 had stated in writing that this module was covered
 * «indirectly».
 *
 * What is watched here is not that the function makes its calls, it is the guarantee
 * STATUS.md declared mitigated and nobody checked: THE RE-WRAPPING HAPPENS IN FULL
 * BEFORE ANYTHING IS SENT. If that breaks, the server accepts the new password, the
 * re-wrapping fails afterwards, and the user is locked out of a vault the server
 * cannot repair because it cannot read anything.
 *
 * Only axios is mocked and nothing else. The cryptography is real and so is
 * `listVaults`, because the only point worth faking is what actually goes out over the
 * wire — the same criterion as auth.register.test.ts. The derivation is 600.000
 * iterations on purpose, so the shared keys are derived once in beforeAll.
 */

const EMAIL = 'ada@evault.test'
const CURRENT = 'la contraseña maestra de siempre'
const NEXT = 'una contraseña maestra nueva y larga'
const WRONG = 'esta no es la contraseña buena'

let current: DerivedKeys
let next: DerivedKeys

beforeAll(async () => {
  current = await deriveKeys(CURRENT, EMAIL)
  next = await deriveKeys(NEXT, EMAIL)
}, 30_000)

afterEach(() => {
  vi.restoreAllMocks()
})

/** A vault with its key genuinely wrapped by the current master key. */
async function vaultWrappedWithCurrent(
  id: string,
): Promise<{ vault: Vault; vaultKey: CryptoKey }> {
  const { vaultKey, wrapped } = await createVaultKey(current.masterKey)

  return {
    vaultKey,
    vault: {
      id,
      name: `vault ${id}`,
      is_personal: true,
      role: 'owner',
      wrapped_key: wrapped.data,
      wrapped_key_iv: wrapped.iv,
    },
  }
}

/** Answers GET /vaults with the given vaults, without touching the network. */
function serveVaults(vaults: Vault[]) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

interface RotationBody {
  current_password: string
  password: string
  wrapped_keys: { vault_id: string; wrapped_key: string; wrapped_key_iv: string }[]
}

describe('changing the master password', () => {
  it('re-wraps every vault\'s key and sends it all in a single request', async () => {
    const first = await vaultWrappedWithCurrent('vault-1')
    const second = await vaultWrappedWithCurrent('vault-2')
    serveVaults([first.vault, second.vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeMasterPassword(EMAIL, CURRENT, NEXT)

    expect(put).toHaveBeenCalledTimes(1)
    const body = put.mock.calls[0]?.[1] as RotationBody
    expect(body.wrapped_keys.map((entry) => entry.vault_id)).toEqual(['vault-1', 'vault-2'])
  })

  it('sends the authentication hashes and neither of the two passwords', async () => {
    const { vault } = await vaultWrappedWithCurrent('vault-1')
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeMasterPassword(EMAIL, CURRENT, NEXT)

    const body = put.mock.calls[0]?.[1] as RotationBody
    expect(body.current_password).toBe(current.authHash)
    expect(body.password).toBe(next.authHash)

    /*
     * And the check that really protects ADR-001: looking for the passwords across the
     * whole body, not only in the fields where they would be expected. A new field
     * carrying them by accident would pass any field-by-field assertion.
     */
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(CURRENT)
    expect(serialized).not.toContain(NEXT)
  })

  it('the re-wrapped key opens with the new password and no longer with the old', async () => {
    const { vault, vaultKey } = await vaultWrappedWithCurrent('vault-1')
    const secret = 'una credencial que tiene que sobrevivir a la rotación'
    const stored = await encrypt(vaultKey, secret)
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeMasterPassword(EMAIL, CURRENT, NEXT)

    const body = put.mock.calls[0]?.[1] as RotationBody
    const rewrapped: Encrypted = {
      data: body.wrapped_keys[0]!.wrapped_key,
      iv: body.wrapped_keys[0]!.wrapped_key_iv,
    }

    /*
     * By really decrypting and not by comparing blobs: what has to be shown is that the
     * SAME vault key is still inside, which is ADR-008's dividend and the reason the
     * items are not touched.
     */
    const reopened = await openVaultKey(next.masterKey, rewrapped)
    await expect(decrypt(reopened, stored)).resolves.toBe(secret)

    await expect(openVaultKey(current.masterKey, rewrapped)).rejects.toThrow(DecryptionError)
  })
})

describe('when something goes wrong', () => {
  it('with the wrong current password it sends no request at all', async () => {
    const { vault } = await vaultWrappedWithCurrent('vault-1')
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeMasterPassword(EMAIL, WRONG, NEXT)).rejects.toThrow(DecryptionError)

    /*
     * THIS is the guarantee STATUS.md declared mitigated without checking it. And it is
     * asserted against the HTTP client, not against the promise: that the call rejects
     * says nothing about whether it sent something first.
     */
    expect(put).not.toHaveBeenCalled()
  })

  it('when one vault\'s re-wrapping fails, it sends none of the others', async () => {
    const good = await vaultWrappedWithCurrent('vault-1')
    const broken = await vaultWrappedWithCurrent('vault-2')
    // A wrapper that opens under no key, like one from a vault with another owner.
    broken.vault.wrapped_key = good.vault.wrapped_key.replace(/^.{4}/, 'AAAA')
    serveVaults([good.vault, broken.vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeMasterPassword(EMAIL, CURRENT, NEXT)).rejects.toThrow(DecryptionError)

    // Nothing half done: either they all get re-wrapped or none goes out.
    expect(put).not.toHaveBeenCalled()
  })

  it('a server failure arrives as an ApiError and not as an axios error', async () => {
    const { vault } = await vaultWrappedWithCurrent('vault-1')
    serveVaults([vault])
    vi.spyOn(api, 'put').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'La contraseña actual no es correcta' } },
      }),
    )

    await expect(changeMasterPassword(EMAIL, CURRENT, NEXT)).rejects.toBeInstanceOf(ApiError)
  })

  it('when the vaults cannot be listed, it attempts no change at all', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('sin red'))
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeMasterPassword(EMAIL, CURRENT, NEXT)).rejects.toThrow()

    expect(put).not.toHaveBeenCalled()
  })
})
