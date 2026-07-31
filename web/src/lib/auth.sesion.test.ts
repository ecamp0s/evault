import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from './api'
import { hidratarSesion, salir } from './auth'
import { useSesion, type Usuario } from './sesion'

const ADA: Usuario = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

function errorConEstado(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

beforeEach(() => {
  useSesion.setState({ usuario: null, token: null, hidratada: false })
})

afterEach(() => {
  vi.restoreAllMocks()
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
})

describe('hidratarSesion', () => {
  it('marca la sesión como comprobada cuando no hay token', async () => {
    const get = vi.spyOn(api, 'get')

    await hidratarSesion()

    expect(get).not.toHaveBeenCalled()
    expect(useSesion.getState().hidratada).toBe(true)
  })

  it('refresca los datos del usuario cuando el token sigue valiendo', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: { user: { ...ADA, name: 'Ada Renombrada' } } },
    })
    useSesion.setState({ usuario: ADA, token: 'token', hidratada: false })

    await hidratarSesion()

    expect(useSesion.getState().usuario?.name).toBe('Ada Renombrada')
    expect(useSesion.getState().token).toBe('token')
    expect(useSesion.getState().hidratada).toBe(true)
  })

  /*
   * No poder verificar no es lo mismo que estar rechazado. Si la API está caída,
   * expulsar al usuario sería peor que mantener la sesión y dejar que falle la
   * siguiente petición real.
   */
  it('conserva la sesión si la API no responde', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new AxiosError('Network Error'))
    useSesion.setState({ usuario: ADA, token: 'token', hidratada: false })

    await hidratarSesion()

    expect(useSesion.getState().token).toBe('token')
    expect(useSesion.getState().hidratada).toBe(true)
  })

  it('siempre deja la sesión marcada como comprobada', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(errorConEstado(500))
    useSesion.setState({ usuario: ADA, token: 'token', hidratada: false })

    await hidratarSesion()

    expect(useSesion.getState().hidratada).toBe(true)
  })
})
