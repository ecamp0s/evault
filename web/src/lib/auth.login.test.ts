import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from './api'
import { entrar } from './auth'
import { useSesion, type Usuario } from './sesion'
import { useVaultKey } from './vault/keyInMemory'
import { VaultUnreachable } from './vault/unlock'
import { DecryptionError, encrypt, createVaultKey, deriveKeys } from './vault/crypto'
import type { Vault } from './vault/types'

/*
 * Entrar son dos pasos —autenticarse y abrir la vault— y lo que estos tests
 * vigilan es que sigan siendo dos y que fallen por separado. Confundirlos daría un
 * usuario dentro de una aplicación que no puede enseñarle nada.
 */

const ADA: Usuario = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

const MAESTRA = 'una contraseña maestra larga'
const CORREO = 'ada@evault.test'

function errorConEstado(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

/** Un vault como lo devolvería la API, con la clave envuelta que se le pase. */
function vaultCon(wrapped: { data: string; iv: string }): Vault {
  return {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.data,
    wrapped_key_iv: wrapped.iv,
  }
}

/** Monta el servidor: login que responde y /vaults que devuelve lo que se le diga. */
function servidorQueDevuelve(vaults: Vault[]) {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { data: { user: ADA, token: 'token-de-prueba' } },
  })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults } } })
}

beforeEach(() => {
  useSesion.setState({ usuario: null, token: null, usuarioRecordado: null })
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('entrar', () => {
  it('no manda la contraseña maestra, sino el hash de autenticación', async () => {
    const { masterKey, authHash } = await deriveKeys(MAESTRA, CORREO)
    const { wrapped } = await createVaultKey(masterKey)

    servidorQueDevuelve([vaultCon(wrapped)])

    await entrar({ email: CORREO, password: MAESTRA })

    const cuerpo = vi.mocked(api.post).mock.calls[0]?.[1] as Record<string, string>

    expect(JSON.stringify(cuerpo)).not.toContain(MAESTRA)
    expect(cuerpo.password).toBe(authHash)
  })

  /*
   * ADR-008 lo pone como argumento principal a favor del diseño elegido: la clave
   * envuelta viaja por /api/vaults, así que el contrato de /api/auth se queda como
   * estaba. Este test lo fija sobre el cuerpo real de la petición.
   */
  it('no cambia el contrato del login', async () => {
    const { masterKey } = await deriveKeys(MAESTRA, CORREO)
    const { wrapped } = await createVaultKey(masterKey)

    servidorQueDevuelve([vaultCon(wrapped)])

    await entrar({ email: CORREO, password: MAESTRA })

    expect(vi.mocked(api.post).mock.calls[0]?.[0]).toBe('/auth/login')
    expect(Object.keys(vi.mocked(api.post).mock.calls[0]?.[1] as object)).toEqual([
      'email',
      'password',
    ])
  })

  it('deja la sesión abierta y la vault desbloqueada', async () => {
    const { masterKey } = await deriveKeys(MAESTRA, CORREO)
    const { wrapped } = await createVaultKey(masterKey)

    servidorQueDevuelve([vaultCon(wrapped)])

    await entrar({ email: CORREO, password: MAESTRA })

    expect(useSesion.getState().token).toBe('token-de-prueba')
    expect(useVaultKey.getState().key).not.toBeNull()
  })

  /*
   * La comprobación de que el ciclo cierra de verdad: lo que se cifró en el registro
   * se puede leer después de entrar. Sin esto, el login podría estar dejando en
   * memoria una clave perfectamente formada que no abre nada de lo guardado.
   */
  it('la clave que deja en memoria descifra lo que cifró el registro', async () => {
    const { masterKey } = await deriveKeys(MAESTRA, CORREO)
    const { vaultKey, wrapped } = await createVaultKey(masterKey)
    const guardadoAntes = await encrypt(vaultKey, 'la contraseña de GitHub')

    servidorQueDevuelve([vaultCon(wrapped)])

    await entrar({ email: CORREO, password: MAESTRA })

    const { decrypt } = await import('./vault/crypto')
    const enMemoria = useVaultKey.getState().key as CryptoKey

    expect(await decrypt(enMemoria, guardadoAntes)).toBe('la contraseña de GitHub')
  })
})

describe('cuando el login falla', () => {
  it('propaga el error y no deja ni sesión ni clave', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorConEstado(422))

    await expect(entrar({ email: CORREO, password: MAESTRA })).rejects.toThrow()

    expect(useSesion.getState().token).toBeNull()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('no llega a pedir los vaults', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorConEstado(422))
    const get = vi.spyOn(api, 'get')

    await expect(entrar({ email: CORREO, password: MAESTRA })).rejects.toThrow()

    expect(get).not.toHaveBeenCalled()
  })
})

/*
 * El caso que da nombre al issue: credenciales correctas y vault que no abre.
 *
 * La sesión no llega a publicarse, y no es un detalle de implementación: el store
 * es lo que miran los guards, así que un token puesto a medias navega a la portada,
 * desmonta el login y se lleva por delante el mensaje de error. Se vio en navegador
 * como un formulario que se vaciaba sin decir nada.
 */
describe('cuando el login funciona pero la vault no abre', () => {
  it('lanza ErrorDeDescifrado si la clave envuelta no es de esta contraseña', async () => {
    const { masterKey } = await deriveKeys('otra contraseña distinta', CORREO)
    const { wrapped } = await createVaultKey(masterKey)

    servidorQueDevuelve([vaultCon(wrapped)])

    await expect(entrar({ email: CORREO, password: MAESTRA })).rejects.toBeInstanceOf(
      DecryptionError,
    )
  })

  it('no publica la sesión, para que la pantalla siga viva y pueda avisar', async () => {
    const { masterKey } = await deriveKeys('otra contraseña distinta', CORREO)
    const { wrapped } = await createVaultKey(masterKey)

    servidorQueDevuelve([vaultCon(wrapped)])

    await expect(entrar({ email: CORREO, password: MAESTRA })).rejects.toThrow()

    expect(useSesion.getState().token).toBeNull()
    expect(useSesion.getState().usuario).toBeNull()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('distingue la cuenta sin vaults, que es otra avería distinta', async () => {
    servidorQueDevuelve([])

    await expect(entrar({ email: CORREO, password: MAESTRA })).rejects.toBeInstanceOf(
      VaultUnreachable,
    )
  })
})
