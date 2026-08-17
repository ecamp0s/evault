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
 * Cambiar el correo. Ver ADR-014.
 *
 * Estos tests están aquí y no mockeados desde la pantalla a propósito: es el agujero
 * que #217 y #218 cerraron para masterPassword.ts y recovery.ts, y no tiene sentido
 * abrirlo otra vez con el módulo hermano.
 *
 * Se mockea solo axios; la criptografía y listVaults son reales, mismo criterio que
 * auth.register.test.ts: el único punto que interesa falsear es lo que llega a salir
 * por el cable. Las derivaciones de contraseña son 600.000 iteraciones y se hacen una
 * vez en beforeAll.
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

describe('cambiar el correo', () => {
  it('reenvuelve la clave para el correo nuevo, conservando la misma vault', async () => {
    /*
     * La garantía de ADR-008: la clave de vault no cambia, solo se reenvuelve. Se
     * comprueba descifrando un item cifrado ANTES del cambio.
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

    // Y con la clave derivada del correo VIEJO ya no abre.
    await expect(openVaultKey(oldKeys.masterKey, rewrapped)).rejects.toThrow(DecryptionError)
  })

  it('manda los hashes de los dos correos y nunca la contraseña', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, false)

    const body = put.mock.calls[0]?.[1] as ChangeBody
    expect(body.email).toBe(NEW_EMAIL)
    // El hash actual se deriva con el correo VIEJO y el nuevo con el NUEVO: es el
    // salt lo que cambia, no la contraseña.
    expect(body.current_password).toBe(oldKeys.authHash)
    expect(body.password).toBe(newKeys.authHash)
    expect(JSON.stringify(body)).not.toContain(MASTER)
  })

  it('con la contraseña equivocada no envía ninguna petición', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeEmail(OLD_EMAIL, NEW_EMAIL, WRONG, false)).rejects.toThrow(DecryptionError)

    expect(put).not.toHaveBeenCalled()
  })

  it('un fallo del servidor llega como ApiError', async () => {
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

describe('la clave de recuperación', () => {
  it('se entrega una nueva a quien tenía una, derivada del correo NUEVO', async () => {
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
     * Derivada con el correo NUEVO, que es el punto entero: si se derivara con el
     * viejo, la clave que se entrega al usuario no abriría nada después del cambio, y
     * eso no se descubriría hasta el día que hiciera falta.
     */
    const { wrapKey } = await deriveRecoveryKeys(generated!.bytes, NEW_EMAIL)
    const recovered = await openVaultKey(wrapKey, wrapped)
    await expect(decrypt(recovered, stored)).resolves.toBe(secret)
  })

  it('a quien no tenía no se le inventa una', async () => {
    // ADR-010 decidió que la clave se ofrece y se puede rechazar, y quien la rechazó
    // está en un estado legítimo. Cambiar el correo no es motivo para imponérsela.
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    const generated = await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, false)

    expect(generated).toBeNull()

    const body = put.mock.calls[0]?.[1] as ChangeBody
    expect(body.recovery_auth_hash).toBeNull()
    expect(body.recovery_wrapped_keys).toEqual([])
  })

  it('nunca manda la clave de recuperación al servidor, solo su hash', async () => {
    const { vault } = await vaultWrappedWithOldEmail()
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    const generated = await changeEmail(OLD_EMAIL, NEW_EMAIL, MASTER, true)

    const serialized = JSON.stringify(put.mock.calls[0]?.[1])
    // En sus dos formas: la que ve el usuario lleva guiones y la de dentro no.
    expect(serialized).not.toContain(generated!.formatted)
    expect(serialized).not.toContain(generated!.formatted.replaceAll('-', ''))
  })
})

describe('con varias vaults', () => {
  it('reenvuelve todas, también las de recuperación', async () => {
    // Dejarse una fuera la deja envuelta con una clave derivada de un correo que ya
    // no existe, y eso no se ve hasta que alguien intenta abrirla.
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
