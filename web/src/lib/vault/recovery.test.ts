import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'
import { createRecoveryKey, recoverAccess } from './recovery'
import { generateRecoveryKey } from './recoveryKey'
import {
  createVaultKey,
  decrypt,
  DecryptionError,
  deriveKeys,
  deriveRecoveryKeys,
  encrypt,
  openVaultKey,
  wrapVaultKeyForRecovery,
  type DerivedKeys,
  type Encrypted,
} from './crypto'
import type { Vault } from './types'

/*
 * This file covers recovery.ts, which sat at ZERO of 23 statements until issue 218 —
 * neither createRecoveryKey nor recoverAccess ran in any test. Their screens were
 * covered, and Recover.tsx reported 100 %: a screen at 100 % on top of a module at 0 %
 * is how this failure hides.
 *
 * It is the worst place in the project to have no coverage. recoverAccess is the
 * SECOND complete path into the vault, and it is used on the day there is no other
 * left: whoever gets there has lost the master password, so if it fails there is no
 * plan B. It is definitive loss by design (ADR-001 §5.1).
 *
 * What is already proven in recoveryKey.test.ts is not repeated here: generation,
 * parsing, the check character and the derivation. What lives here is the two complete
 * flows and what goes out over the wire.
 *
 * Only axios is mocked; the cryptography is real. The password derivations are 600.000
 * iterations and are done once in beforeAll; the recovery key's are HKDF and are
 * cheap, so they go per test.
 */

const EMAIL = 'ada@evault.test'
const MASTER = 'la contraseña maestra de siempre'
const NEW_MASTER = 'la contraseña que se elige al recuperar'
const WRONG = 'esta no es la contraseña buena'

let master: DerivedKeys
let renewed: DerivedKeys

beforeAll(async () => {
  master = await deriveKeys(MASTER, EMAIL)
  renewed = await deriveKeys(NEW_MASTER, EMAIL)
}, 30_000)

afterEach(() => {
  vi.restoreAllMocks()
})

/** A vault with its key genuinely wrapped by the master key. */
async function vaultOf(id: string): Promise<{ vault: Vault; vaultKey: CryptoKey }> {
  const { vaultKey, wrapped } = await createVaultKey(master.masterKey)

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

function serveVaults(vaults: Vault[]) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

interface RegistrationBody {
  recovery_auth_hash: string
  wrapped_keys: {
    vault_id: string
    recovery_wrapped_key: string
    recovery_wrapped_key_iv: string
  }[]
}

describe('registering a recovery key', () => {
  it('wraps every vault\'s key, not just the first one\'s', async () => {
    /*
     * The module's comment says why this matters: «a vault with no recovery wrapper is
     * a vault the key would not open on the day it was needed».
     */
    const first = await vaultOf('vault-1')
    const second = await vaultOf('vault-2')
    serveVaults([first.vault, second.vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await createRecoveryKey(EMAIL, MASTER)

    const body = post.mock.calls[0]?.[1] as RegistrationBody
    expect(body.wrapped_keys.map((entry) => entry.vault_id)).toEqual(['vault-1', 'vault-2'])
  })

  it('the key handed to the user is the one that opens the registered wrapper', async () => {
    const { vault, vaultKey } = await vaultOf('vault-1')
    const secret = 'una credencial que la clave de recuperación tiene que poder rescatar'
    const stored = await encrypt(vaultKey, secret)
    serveVaults([vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    const generated = await createRecoveryKey(EMAIL, MASTER)

    const body = post.mock.calls[0]?.[1] as RegistrationBody
    const wrapped: Encrypted = {
      data: body.wrapped_keys[0]!.recovery_wrapped_key,
      iv: body.wrapped_keys[0]!.recovery_wrapped_key_iv,
    }

    // The user's path is walked: from the bytes on the paper to decrypting an item.
    const { wrapKey } = await deriveRecoveryKeys(generated.bytes, EMAIL)
    const recovered = await openVaultKey(wrapKey, wrapped)
    await expect(decrypt(recovered, stored)).resolves.toBe(secret)
  })

  it('the hash and the blobs travel to the server, never the key or the password', async () => {
    const { vault } = await vaultOf('vault-1')
    serveVaults([vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    const generated = await createRecoveryKey(EMAIL, MASTER)

    const body = post.mock.calls[0]?.[1] as RegistrationBody
    const { authHash } = await deriveRecoveryKeys(generated.bytes, EMAIL)
    expect(body.recovery_auth_hash).toBe(authHash)

    /*
     * Searched for across the whole body and not in the fields where they would be
     * expected, as in masterPassword.test.ts: a new field carrying them by accident
     * would pass any field-by-field assertion. And the key is looked for in both its
     * forms, because the one the user sees carries dashes and the inner one does not.
     */
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(MASTER)
    expect(serialized).not.toContain(generated.formatted)
    expect(serialized).not.toContain(generated.formatted.replaceAll('-', ''))
  })

  it('with the wrong master password it sends no request at all', async () => {
    const { vault } = await vaultOf('vault-1')
    serveVaults([vault])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })

    await expect(createRecoveryKey(EMAIL, WRONG)).rejects.toThrow(DecryptionError)

    // The wrapping happens in full before anything is sent, as in #59.
    expect(post).not.toHaveBeenCalled()
  })

  it('a server failure arrives as an ApiError', async () => {
    const { vault } = await vaultOf('vault-1')
    serveVaults([vault])
    vi.spyOn(api, 'post').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 500, data: { message: 'Algo ha ido mal' } },
      }),
    )

    await expect(createRecoveryKey(EMAIL, MASTER)).rejects.toBeInstanceOf(ApiError)
  })
})

/** Sets up the scenario of a recovery: the wrapper the server would return. */
async function recoverableVault(id = 'vault-1') {
  const { vault, vaultKey } = await vaultOf(id)
  const generated = generateRecoveryKey()
  const { wrapKey, authHash } = await deriveRecoveryKeys(generated.bytes, EMAIL)
  const wrapped = await wrapVaultKeyForRecovery(
    master.masterKey,
    { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
    wrapKey,
  )

  return {
    generated,
    authHash,
    vaultKey,
    entry: {
      vault_id: id,
      recovery_wrapped_key: wrapped.data,
      recovery_wrapped_key_iv: wrapped.iv,
    },
  }
}

interface CompletionBody {
  password: string
  wrapped_keys: { vault_id: string; wrapped_key: string; wrapped_key_iv: string }[]
}

describe('recovering access', () => {
  it('recovers the SAME vault key, it does not create a new one', async () => {
    /*
     * It is ADR-010's guarantee: access to what is there is recovered, nothing starts
     * from scratch. Checked by decrypting an item encrypted before the recovery.
     */
    const scenario = await recoverableVault()
    const secret = 'lo que había dentro antes de perder la contraseña'
    const stored = await encrypt(scenario.vaultKey, secret)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const body = post.mock.calls[1]?.[1] as CompletionBody
    const rewrapped: Encrypted = {
      data: body.wrapped_keys[0]!.wrapped_key,
      iv: body.wrapped_keys[0]!.wrapped_key_iv,
    }
    const reopened = await openVaultKey(renewed.masterKey, rewrapped)
    await expect(decrypt(reopened, stored)).resolves.toBe(secret)
  })

  it('the first request sends the key\'s hash and never the key', async () => {
    const scenario = await recoverableVault()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const body = post.mock.calls[0]?.[1] as { email: string; recovery_auth_hash: string }
    expect(body.recovery_auth_hash).toBe(scenario.authHash)
    expect(JSON.stringify(body)).not.toContain(scenario.generated.formatted.replaceAll('-', ''))
  })

  it('the final step goes with the single-use token and not the session\'s', async () => {
    /*
     * The explicit header is the only thing that makes that request reachable: the
     * recovery token does not carry the `*` ability, so EnsureRecoveryToken accepts it
     * and the session interceptor would not do. Without this header, recovering fails
     * at the very last step, with the new password already chosen.
     */
    const scenario = await recoverableVault()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const config = post.mock.calls[1]?.[2] as { headers: Record<string, string> }
    expect(config.headers.Authorization).toBe('Bearer token-de-un-solo-uso')
  })

  it('the new password travels as a hash and not in the clear', async () => {
    const scenario = await recoverableVault()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER)

    const body = post.mock.calls[1]?.[1] as CompletionBody
    expect(body.password).toBe(renewed.authHash)
    expect(JSON.stringify(body)).not.toContain(NEW_MASTER)
  })

  it('when the server refuses the key, nothing more is derived or requested', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'No se ha podido recuperar el acceso' } },
      }),
    )

    await expect(
      recoverAccess(EMAIL, generateRecoveryKey().bytes, NEW_MASTER),
    ).rejects.toBeInstanceOf(ApiError)

    // One single call: the one that failed. Nothing is attempted to complete it.
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('a failure at the last step arrives as an ApiError, not as an axios error', async () => {
    /*
     * The worst possible moment for a badly communicated error: the recovery key has
     * been validated, the wrapper has been reopened and the user has already chosen
     * their new password. If that failure arrives raw, the interface cannot say what
     * happened, nor whether the password ended up set.
     */
    const scenario = await recoverableVault()
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [scenario.entry], token: 'token-de-un-solo-uso' } },
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('Request failed'), {
          isAxiosError: true,
          response: { status: 401, data: { message: 'El token de recuperación ha caducado' } },
        }),
      )

    await expect(
      recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('a wrapper that does not open fails differently from a refused key', async () => {
    /*
     * The distinction the module itself documents: if the server has said the key is
     * right and the wrapper does not open, it is no longer a credentials problem. Here
     * that has to come out as DecryptionError and not as ApiError, because what to do
     * about each is nothing alike.
     */
    const scenario = await recoverableVault()
    const corrupted = {
      ...scenario.entry,
      recovery_wrapped_key: scenario.entry.recovery_wrapped_key.replace(/^.{4}/, 'AAAA'),
    }
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: { data: { wrapped_keys: [corrupted], token: 'token-de-un-solo-uso' } },
      })
      .mockResolvedValueOnce({ data: {} })

    await expect(
      recoverAccess(EMAIL, scenario.generated.bytes, NEW_MASTER),
    ).rejects.toThrow(DecryptionError)
  })
})
