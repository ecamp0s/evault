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
 * Este fichero cubre `changeMasterPassword`, que estaba a CERO de 40 líneas hasta el
 * issue 217. Su pantalla sí estaba cubierta, pero sustituyendo esta función con
 * `vi.spyOn`, así que lo que decide si alguien pierde el acceso a su vault no se
 * ejecutaba en ningún test del repositorio. Peor: el issue 202 había afirmado por
 * escrito que este módulo estaba cubierto «indirectamente».
 *
 * Lo que se vigila aquí no es que la función haga sus llamadas, es la garantía que
 * STATUS.md declaraba mitigada y nadie comprobaba: EL REENVOLVIDO OCURRE ENTERO
 * ANTES DE ENVIAR NADA. Si eso se rompe, el servidor acepta la contraseña nueva, el
 * reenvolvido falla después, y el usuario queda fuera de una vault que el servidor
 * no puede reparar porque no puede leer nada.
 *
 * Se mockea solo axios y nada más. La criptografía es real y `listVaults` también,
 * porque el único punto que interesa falsear es lo que llega a salir por el cable —
 * mismo criterio que auth.register.test.ts. La derivación son 600.000 iteraciones a
 * propósito, así que las claves compartidas se derivan una vez en beforeAll.
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

/** Un vault con su clave envuelta de verdad por la clave maestra actual. */
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

/** Responde a GET /vaults con los vaults dados, sin tocar la red. */
function serveVaults(vaults: Vault[]) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

interface RotationBody {
  current_password: string
  password: string
  wrapped_keys: { vault_id: string; wrapped_key: string; wrapped_key_iv: string }[]
}

describe('cambiar la contraseña maestra', () => {
  it('reenvuelve la clave de cada vault y lo manda todo en una sola petición', async () => {
    const first = await vaultWrappedWithCurrent('vault-1')
    const second = await vaultWrappedWithCurrent('vault-2')
    serveVaults([first.vault, second.vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeMasterPassword(EMAIL, CURRENT, NEXT)

    expect(put).toHaveBeenCalledTimes(1)
    const body = put.mock.calls[0]?.[1] as RotationBody
    expect(body.wrapped_keys.map((entry) => entry.vault_id)).toEqual(['vault-1', 'vault-2'])
  })

  it('manda los hashes de autenticación y ninguna de las dos contraseñas', async () => {
    const { vault } = await vaultWrappedWithCurrent('vault-1')
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await changeMasterPassword(EMAIL, CURRENT, NEXT)

    const body = put.mock.calls[0]?.[1] as RotationBody
    expect(body.current_password).toBe(current.authHash)
    expect(body.password).toBe(next.authHash)

    /*
     * Y la comprobación que de verdad protege ADR-001: buscar las contraseñas en el
     * cuerpo entero, no solo en los campos donde se esperarían. Un campo nuevo que
     * las llevara por descuido pasaría cualquier aserción campo a campo.
     */
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(CURRENT)
    expect(serialized).not.toContain(NEXT)
  })

  it('la clave reenvuelta abre con la contraseña nueva y ya no con la vieja', async () => {
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
     * Descifrando de verdad y no comparando blobs: lo que hay que demostrar es que la
     * MISMA clave de vault sigue dentro, que es el dividendo de ADR-008 y la razón de
     * que los items no se toquen.
     */
    const reopened = await openVaultKey(next.masterKey, rewrapped)
    await expect(decrypt(reopened, stored)).resolves.toBe(secret)

    await expect(openVaultKey(current.masterKey, rewrapped)).rejects.toThrow(DecryptionError)
  })
})

describe('cuando algo va mal', () => {
  it('con la contraseña actual equivocada no envía ninguna petición', async () => {
    const { vault } = await vaultWrappedWithCurrent('vault-1')
    serveVaults([vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeMasterPassword(EMAIL, WRONG, NEXT)).rejects.toThrow(DecryptionError)

    /*
     * ESTA es la garantía que STATUS.md declaraba mitigada sin comprobarla. Y se
     * afirma sobre el cliente HTTP, no sobre la promesa: que la llamada rechace no
     * dice nada sobre si antes mandó algo.
     */
    expect(put).not.toHaveBeenCalled()
  })

  it('si el reenvolvido de un vault falla, no envía los de los demás', async () => {
    const good = await vaultWrappedWithCurrent('vault-1')
    const broken = await vaultWrappedWithCurrent('vault-2')
    // Un envoltorio que no abre con ninguna clave, como el de un vault de otro dueño.
    broken.vault.wrapped_key = good.vault.wrapped_key.replace(/^.{4}/, 'AAAA')
    serveVaults([good.vault, broken.vault])
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeMasterPassword(EMAIL, CURRENT, NEXT)).rejects.toThrow(DecryptionError)

    // Nada a medias: o se reenvuelven todos o no sale ninguno.
    expect(put).not.toHaveBeenCalled()
  })

  it('un fallo del servidor llega como ApiError y no como error de axios', async () => {
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

  it('si no se pueden listar los vaults, no intenta cambiar nada', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('sin red'))
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} })

    await expect(changeMasterPassword(EMAIL, CURRENT, NEXT)).rejects.toThrow()

    expect(put).not.toHaveBeenCalled()
  })
})
