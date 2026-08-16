import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from './api'
import { unlock, logOut } from './auth'
import { useSession, type User } from './session'
import { useVaultKey } from './vault/keyInMemory'
import { createVaultKey, deriveKeys } from './vault/crypto'
import type { Vault } from './vault/types'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

const MASTER = 'una contraseña maestra larga'

function errorWithStatus(state: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: state, statusText: '', data: {}, headers, config: { headers } }

  return error
}

function vaultWith(wrapped: { data: string; iv: string }): Vault {
  return {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.data,
    wrapped_key_iv: wrapped.iv,
  }
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null, token: null, rememberedUser: null })
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * El issue #73 y ADR-007 en un solo bloque: lo que no puede pasar es que el token
 * sobreviva a la recarga en ninguna forma.
 */
describe('dónde vive el token', () => {
  it('no aparece en localStorage al autenticarse', () => {
    useSession.getState().authenticate(ADA, 'token-secretísimo')

    expect(JSON.stringify(localStorage)).not.toContain('token-secretísimo')
  })

  it('no aparece en sessionStorage ni en cookies', () => {
    useSession.getState().authenticate(ADA, 'token-secretísimo')

    expect(Object.keys(sessionStorage)).toHaveLength(0)
    expect(document.cookie).not.toContain('token-secretísimo')
  })

  /*
   * Lo que sí se persiste, y por qué: sin el correo no habría a quién pedirle la
   * contraseña maestra, y recargar sería una expulsión al formulario en blanco en
   * vez de un bloqueo. No es un secreto: lo escribió el propio usuario.
   */
  it('sí recuerda quién estaba usando la aplicación', () => {
    useSession.getState().authenticate(ADA, 'token')

    const saved = JSON.stringify(localStorage)

    expect(saved).toContain('ada@evault.test')
    expect(saved).toContain('Ada Lovelace')
  })

  it('la lista de campos persistidos es exactamente una', () => {
    useSession.getState().authenticate(ADA, 'token')

    const saved = JSON.parse(localStorage.getItem('evault.sesion') ?? '{}') as {
      state: Record<string, unknown>
    }

    expect(Object.keys(saved.state)).toEqual(['rememberedUser'])
  })
})

describe('cerrar sesión y olvidar', () => {
  /*
   * La distinción que hace posible el bloqueo: cerrar sesión no borra quién eras.
   * Si lo borrara, recargar llevaría al formulario de entrada en blanco, que es
   * exactamente lo que ADR-007 pide evitar.
   */
  it('cerrarSesion deja el usuario recordado', () => {
    useSession.getState().authenticate(ADA, 'token')
    useSession.getState().clearSession()

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().rememberedUser?.email).toBe('ada@evault.test')
  })

  it('olvidarUsuario sí lo borra, para el ordenador compartido', () => {
    useSession.getState().authenticate(ADA, 'token')
    useSession.getState().forgetUser()

    expect(useSession.getState().rememberedUser).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })
})

describe('salir', () => {
  it('revoca el token en el servidor', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null })
    useSession.getState().authenticate(ADA, 'token')

    await logOut()

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * Si el servidor no responde, la sesión local se cierra igualmente. Dejarla
   * abierta sería lo peor de las dos opciones: el usuario cree que ha salido y no
   * ha salido. Un token vivo en el servidor es recuperable; una sesión abierta en
   * un ordenador compartido, no.
   */
  it('limpia la sesión local aunque la petición falle', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    useSession.getState().authenticate(ADA, 'token')

    await expect(logOut()).resolves.toBeUndefined()

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().user).toBeNull()
  })

  it('olvida también la clave de la vault', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: null })

    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { vaultKey } = await createVaultKey(masterKey)

    useSession.getState().authenticate(ADA, 'token')
    useVaultKey.getState().save(vaultKey)

    await logOut()

    expect(useVaultKey.getState().key).toBeNull()
  })
})

/*
 * Sustituye a los tests de la antigua hidratarSesion, que verificaba contra
 * /auth/me el token recuperado de localStorage. Ya no hay token que recuperar.
 */
describe('desbloquear', () => {
  it('usa el correo recordado, sin pedirlo otra vez', async () => {
    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { wrapped } = await createVaultKey(masterKey)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-nuevo' } } })
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vaultWith(wrapped)] } } })

    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    await unlock(MASTER)

    expect((post.mock.calls[0]?.[1] as { email: string }).email).toBe('ada@evault.test')
    expect(useSession.getState().token).toBe('token-nuevo')
    expect(useVaultKey.getState().key).not.toBeNull()
  })

  it('no manda la contraseña maestra', async () => {
    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { wrapped } = await createVaultKey(masterKey)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-nuevo' } } })
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vaultWith(wrapped)] } } })

    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    await unlock(MASTER)

    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain(MASTER)
  })

  it('propaga el rechazo si la contraseña no es la correcta', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(401))

    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    await expect(unlock('la que no es')).rejects.toThrow()
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * No debería ocurrir, porque la pantalla solo se muestra con usuario recordado.
   * Falla de forma explícita en vez de intentar entrar con un correo vacío, que
   * devolvería «credenciales incorrectas» y despistaría a quien lo investigue.
   */
  it('falla si no hay ninguna cuenta recordada', async () => {
    const post = vi.spyOn(api, 'post')

    await expect(unlock(MASTER)).rejects.toThrow(/cuenta recordada/i)
    expect(post).not.toHaveBeenCalled()
  })
})
