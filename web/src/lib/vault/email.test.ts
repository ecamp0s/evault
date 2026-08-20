import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'
import { changeEmail } from './email'
import {
  createVaultKey,
  decrypt,
  DecryptionError,
  deriveKeys,
  deriveRecoveryKeys,
  encrypt,
  openVaultKey,
  type DerivedKeys,
  type Encrypted,
} from './crypto'
import type { Vault } from './types'

/*
 * Changing the email. See ADR-014.
 *
 * These tests live here and are not mocked from the screen on purpose: that is the
 * hole #217 and #218 closed for masterPassword.ts and recovery.ts, and there is no
 * sense in opening it again for the sibling module.
 *
 * Only axios is mocked; the cryptography and listVaults are real, the same criterion
 * as auth.register.test.ts: the only point worth faking is what actually goes out over
 * the wire. The password derivations are 600.000 iterations and are done once in
 * beforeAll.
 */

const OLD_EMAIL = 'ada@evault.test'
const NEW_EMAIL = 'ada.lovelace@evault.test'
const MASTER = 'la contraseña maestra de siempre'
const WRONG = 'esta no es la contraseña buena'

let oldKeys: DerivedKeys
let newKeys: DerivedKeys

beforeAll(async () => {
  oldKeys = await deriveKeys(MASTER, OLD_EMAIL)
  newKeys = await deriveKeys(MASTER, NEW_EMAIL)
}, 30_000)

afterEach(() => {
  vi.restoreAllMocks()
})

async function vaultWrappedWithOldEmail(id = 'vault-1') {
  const { vaultKey, wrapped } = await createVaultKey(oldKeys.masterKey)

  return {
    vaultKey,
    vault: {
      id,
      name: 'Personal',
      is_personal: true,
      role: 'owner',
      wrapped_key: wrapped.data,
      wrapped_key_iv: wrapped.iv,
    } satisfies Vault,
  }
}

function serveVaults(vaults: Vault[]) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

interface ChangeBody {
  email: string
  current_password: string
  password: string
  wrapped_keys: { vault_id: string; wrapped_key: string; wrapped_key_iv: string }[]
  recovery_auth_hash: string | null
  recovery_wrapped_keys: {
    vault_id: string
    recovery_wrapped_key: string
    recovery_wrapped_key_iv: string
  }[]
}

describe('changing the email', () => {
  it('re-wraps the key for the new email, keeping the same vault', async () => {
    /*
     * ADR-008's guarantee: the vault key does not change, it is only re-wrapped.
     * Checked by decrypting an item encrypted BEFORE the change.
     */
    const { vault, vaultKey } = await vaultWrappedWithOldEmail()
    const secret = 'una credencial que tiene que sobrevivir al cambio de correo'
    const stored = await encrypt(vaultKey, secret)
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, false)

    const body = put.mock.calls[0]?.[1] as ChangeBody
    const rewrapped: Encrypted = {
      data: body.wrapped_keys[0]!.wrapped_key,
      iv: body.wrapped_keys[0]!.wrapped_key_iv,
    }

    const reopened = await openVaultKey(newKeys.masterKey, rewrapped)
    await expect(decrypt(reopened, stored)).resolves.toBe(secret)

    // And under the key derived from the OLD email it no longer opens.
    await expect(openVaultKey(oldKeys.masterKey, rewrapped)).rejects.toThrow(DecryptionError)
  })

  it('sends the hashes of both emails and never the password', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, false)

    const body = put.mock.calls[0]?.[1] as ChangeBody
    expect(body.email).toBe(NEW_EMAIL)
    // The current hash is derived with the OLD email and the new one with the NEW:
    // what changes is the salt, not the password.
    expect(body.current_password).toBe(oldKeys.authHash)
    expect(body.password).toBe(newKeys.authHash)
    expect(JSON.stringify(body)).not.toContain(MASTER)
  })

  it('with the wrong password it sends no request at all', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeEmail(OLD_EMAIL, NEW_EMAIL, WRONG, false)).rejects.toThrow(DecryptionError)

    expect(put).not.toHaveBeenCalled()
  })

  it('a server failure arrives as an ApiError', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    vi.spyOn(api, 'put').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'Ese correo ya está registrado' } },
      }),
    )

    await expect(changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, false)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('the recovery key', () => {
  it('a new one is handed to whoever had one, derived from the NEW email', async () => {
    const { vault, vaultKey } = await vaultWrappedWithOldEmail()
    const secret = 'lo que la clave de recuperación tiene que poder rescatar'
    const stored = await encrypt(vaultKey, secret)
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    const generated = await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, true)

    expect(generated).not.toBeNull()

    const body = put.mock.calls[0]?.[1] as ChangeBody
    const wrapped: Encrypted = {
      data: body.recovery_wrapped_keys[0]!.recovery_wrapped_key,
      iv: body.recovery_wrapped_keys[0]!.recovery_wrapped_key_iv,
    }

    /*
     * Derived with the NEW email, which is the whole point: were it derived with the
     * old one, the key handed to the user would open nothing after the change, and that
     * would not be found out until the day it was needed.
     */
    const { wrapKey } = await deriveRecoveryKeys(generated!.bytes, NEW_EMAIL)
    const recovered = await openVaultKey(wrapKey, wrapped)
    await expect(decrypt(recovered, stored)).resolves.toBe(secret)
  })

  it('one is not invented for whoever had none', async () => {
    // ADR-010 decided the key is offered and can be declined, and whoever declined is
    // in a legitimate state. Changing the email is no reason to impose it on them.
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    const generated = await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, false)

    expect(generated).toBeNull()

    const body = put.mock.calls[0]?.[1] as ChangeBody
    expect(body.recovery_auth_hash).toBeNull()
    expect(body.recovery_wrapped_keys).toEqual([])
  })

  it('never sends the recovery key to the server, only its hash', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    const generated = await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, true)

    const serialized = JSON.stringify(put.mock.calls[0]?.[1])
    // In both its forms: the one the user sees carries dashes and the inner one does not.
    expect(serialized).not.toContain(generated!.formatted)
    expect(serialized).not.toContain(generated!.formatted.replaceAll('-', ''))
  })
})

describe('with several vaults', () => {
  it('re-wraps them all, the recovery ones included', async () => {
    // Leaving one out leaves it wrapped under a key derived from an email that no
    // longer exists, and that does not show until somebody tries to open it.
    const first = await vaultWrappedWithOldEmail('vault-1')
    const second = await vaultWrappedWithOldEmail('vault-2')
    serveVaults([first.vault, second.vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, true)

    const body = put.mock.calls[0]?.[1] as ChangeBody
    expect(body.wrapped_keys.map((entry) => entry.vault_id)).toEqual(['vault-1', 'vault-2'])
    expect(body.recovery_wrapped_keys.map((entry) => entry.vault_id)).toEqual([
      'vault-1',
      'vault-2',
    ])
  })
})
