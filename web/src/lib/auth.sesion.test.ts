import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from './api'
import { desbloquear, salir } from './auth'
import { useSesion, type Usuario } from './sesion'
import { useClaveDeVault } from './vault/claveEnMemoria'
import { crearClaveDeVault, derivarClaves } from './vault/cripto'
import type { Vault } from './vault/tipos'

const ADA: Usuario = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

const MAESTRA = 'una contraseña maestra larga'

function errorConEstado(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

function vaultCon(wrapped: { datos: string; iv: string }): Vault {
  return {
    id: 'vault-1',
    name: 'Personal',
    is_personal: true,
    role: 'owner',
    wrapped_key: wrapped.datos,
    wrapped_key_iv: wrapped.iv,
  }
}

beforeEach(() => {
  localStorage.clear()
  useSesion.setState({ usuario: null, token: null, usuarioRecordado: null })
  useClaveDeVault.setState({ clave: null })
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
    useSesion.getState().autenticar(ADA, 'token-secretísimo')

    expect(JSON.stringify(localStorage)).not.toContain('token-secretísimo')
  })

  it('no aparece en sessionStorage ni en cookies', () => {
    useSesion.getState().autenticar(ADA, 'token-secretísimo')

    expect(Object.keys(sessionStorage)).toHaveLength(0)
    expect(document.cookie).not.toContain('token-secretísimo')
  })

  /*
   * Lo que sí se persiste, y por qué: sin el correo no habría a quién pedirle la
   * contraseña maestra, y recargar sería una expulsión al formulario en blanco en
   * vez de un bloqueo. No es un secreto: lo escribió el propio usuario.
   */
  it('sí recuerda quién estaba usando la aplicación', () => {
    useSesion.getState().autenticar(ADA, 'token')

    const guardado = JSON.stringify(localStorage)

    expect(guardado).toContain('ada@evault.test')
    expect(guardado).toContain('Ada Lovelace')
  })

  it('la lista de campos persistidos es exactamente una', () => {
    useSesion.getState().autenticar(ADA, 'token')

    const guardado = JSON.parse(localStorage.getItem('evault.sesion') ?? '{}') as {
      state: Record<string, unknown>
    }

    expect(Object.keys(guardado.state)).toEqual(['usuarioRecordado'])
  })
})

describe('cerrar sesión y olvidar', () => {
  /*
   * La distinción que hace posible el bloqueo: cerrar sesión no borra quién eras.
   * Si lo borrara, recargar llevaría al formulario de entrada en blanco, que es
   * exactamente lo que ADR-007 pide evitar.
   */
  it('cerrarSesion deja el usuario recordado', () => {
    useSesion.getState().autenticar(ADA, 'token')
    useSesion.getState().cerrarSesion()

    expect(useSesion.getState().token).toBeNull()
    expect(useSesion.getState().usuarioRecordado?.email).toBe('ada@evault.test')
  })

  it('olvidarUsuario sí lo borra, para el ordenador compartido', () => {
    useSesion.getState().autenticar(ADA, 'token')
    useSesion.getState().olvidarUsuario()

    expect(useSesion.getState().usuarioRecordado).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })
})

describe('salir', () => {
  it('revoca el token en el servidor', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null })
    useSesion.getState().autenticar(ADA, 'token')

    await salir()

    expect(post).toHaveBeenCalledWith('/auth/logout')
    expect(useSesion.getState().token).toBeNull()
  })

  /*
   * Si el servidor no responde, la sesión local se cierra igualmente. Dejarla
   * abierta sería lo peor de las dos opciones: el usuario cree que ha salido y no
   * ha salido. Un token vivo en el servidor es recuperable; una sesión abierta en
   * un ordenador compartido, no.
   */
  it('limpia la sesión local aunque la petición falle', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    useSesion.getState().autenticar(ADA, 'token')

    await expect(salir()).resolves.toBeUndefined()

    expect(useSesion.getState().token).toBeNull()
    expect(useSesion.getState().usuario).toBeNull()
  })

  it('olvida también la clave de la vault', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: null })

    const { claveMaestra } = await derivarClaves(MAESTRA, ADA.email)
    const { claveDeVault } = await crearClaveDeVault(claveMaestra)

    useSesion.getState().autenticar(ADA, 'token')
    useClaveDeVault.getState().guardar(claveDeVault)

    await salir()

    expect(useClaveDeVault.getState().clave).toBeNull()
  })
})

/*
 * Sustituye a los tests de la antigua hidratarSesion, que verificaba contra
 * /auth/me el token recuperado de localStorage. Ya no hay token que recuperar.
 */
describe('desbloquear', () => {
  it('usa el correo recordado, sin pedirlo otra vez', async () => {
    const { claveMaestra } = await derivarClaves(MAESTRA, ADA.email)
    const { envoltorio } = await crearClaveDeVault(claveMaestra)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-nuevo' } } })
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vaultCon(envoltorio)] } } })

    useSesion.setState({ usuarioRecordado: { name: ADA.name, email: ADA.email } })

    await desbloquear(MAESTRA)

    expect((post.mock.calls[0]?.[1] as { email: string }).email).toBe('ada@evault.test')
    expect(useSesion.getState().token).toBe('token-nuevo')
    expect(useClaveDeVault.getState().clave).not.toBeNull()
  })

  it('no manda la contraseña maestra', async () => {
    const { claveMaestra } = await derivarClaves(MAESTRA, ADA.email)
    const { envoltorio } = await crearClaveDeVault(claveMaestra)

    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-nuevo' } } })
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [vaultCon(envoltorio)] } } })

    useSesion.setState({ usuarioRecordado: { name: ADA.name, email: ADA.email } })

    await desbloquear(MAESTRA)

    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain(MAESTRA)
  })

  it('propaga el rechazo si la contraseña no es la correcta', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorConEstado(401))

    useSesion.setState({ usuarioRecordado: { name: ADA.name, email: ADA.email } })

    await expect(desbloquear('la que no es')).rejects.toThrow()
    expect(useSesion.getState().token).toBeNull()
  })

  /*
   * No debería ocurrir, porque la pantalla solo se muestra con usuario recordado.
   * Falla de forma explícita en vez de intentar entrar con un correo vacío, que
   * devolvería «credenciales incorrectas» y despistaría a quien lo investigue.
   */
  it('falla si no hay ninguna cuenta recordada', async () => {
    const post = vi.spyOn(api, 'post')

    await expect(desbloquear(MAESTRA)).rejects.toThrow(/cuenta recordada/i)
    expect(post).not.toHaveBeenCalled()
  })
})
