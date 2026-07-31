import { beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from './api'
import { useSesion, type Usuario } from './sesion'

const ADA: Usuario = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: '2026-07-30T00:00:00+00:00',
}

/**
 * Hace una petición real a través del cliente, con un adaptador que la intercepta
 * antes de salir a la red y devuelve la configuración que habría viajado.
 *
 * Sustituir el adaptador y no los interceptores es lo que hace fiable el test:
 * los interceptores se ejecutan de verdad, en su orden real, igual que en la
 * aplicación.
 */
async function cabecerasEnviadas(): Promise<Record<string, unknown>> {
  const adaptadorOriginal = api.defaults.adapter
  let capturada: InternalAxiosRequestConfig | undefined

  api.defaults.adapter = async (config) => {
    capturada = config

    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }

  try {
    await api.get('/loquesea')
  } finally {
    api.defaults.adapter = adaptadorOriginal
  }

  return (capturada?.headers ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  useSesion.getState().cerrarSesion()
})

describe('store de sesión', () => {
  it('empieza sin usuario ni token', () => {
    expect(useSesion.getState().usuario).toBeNull()
    expect(useSesion.getState().token).toBeNull()
  })

  it('guarda usuario y token al autenticar', () => {
    useSesion.getState().autenticar(ADA, 'token-secreto')

    expect(useSesion.getState().usuario).toEqual(ADA)
    expect(useSesion.getState().token).toBe('token-secreto')
  })

  it('los borra al cerrar sesión', () => {
    useSesion.getState().autenticar(ADA, 'token-secreto')
    useSesion.getState().cerrarSesion()

    expect(useSesion.getState().usuario).toBeNull()
    expect(useSesion.getState().token).toBeNull()
  })

  it('persiste la sesión para que sobreviva a un refresco', () => {
    useSesion.getState().autenticar(ADA, 'token-secreto')

    expect(localStorage.getItem('evault.sesion')).toContain('token-secreto')
  })
})

describe('interceptor de 401', () => {
  /**
   * Fuerza una respuesta con el estado indicado a través del cliente real, para
   * que los interceptores de respuesta se ejecuten como en la aplicación.
   */
  async function peticionQueDevuelve(estado: number): Promise<void> {
    const adaptadorOriginal = api.defaults.adapter

    api.defaults.adapter = async (config) => {
      const error = new AxiosError('Request failed') as AxiosError & {
        response: unknown
      }
      error.response = {
        status: estado,
        statusText: '',
        data: {},
        headers: new AxiosHeaders(),
        config,
      }
      error.config = config

      throw error
    }

    try {
      await api.get('/loquesea')
    } catch {
      // el rechazo es el caso bajo prueba
    } finally {
      api.defaults.adapter = adaptadorOriginal
    }
  }

  it('cierra la sesión cuando el servidor responde 401', async () => {
    useSesion.getState().autenticar(ADA, 'token-caducado')

    await peticionQueDevuelve(401)

    expect(useSesion.getState().token).toBeNull()
    expect(useSesion.getState().usuario).toBeNull()
  })

  /*
   * Solo el 401 expulsa. Un 500 o un 422 son problemas de la petición concreta,
   * no de la credencial, y cerrar sesión por ellos echaría al usuario cada vez
   * que el servidor tuviera un mal día.
   */
  it('no cierra la sesión ante otros errores', async () => {
    useSesion.getState().autenticar(ADA, 'token-bueno')

    await peticionQueDevuelve(500)
    expect(useSesion.getState().token).toBe('token-bueno')

    await peticionQueDevuelve(422)
    expect(useSesion.getState().token).toBe('token-bueno')
  })

  it('no hace nada si ya no había sesión', async () => {
    await peticionQueDevuelve(401)

    expect(useSesion.getState().token).toBeNull()
  })
})

describe('interceptor de Authorization', () => {
  it('no envía la cabecera sin sesión', async () => {
    const cabeceras = await cabecerasEnviadas()

    expect(cabeceras.Authorization).toBeUndefined()
  })

  it('envía el token como Bearer cuando hay sesión', async () => {
    useSesion.getState().autenticar(ADA, 'token-secreto')

    const cabeceras = await cabecerasEnviadas()

    expect(cabeceras.Authorization).toBe('Bearer token-secreto')
  })

  /*
   * El token se lee del store en cada petición y no se fija una vez al arrancar.
   * Si se fijara, seguiría enviándose después de cerrar sesión y el servidor
   * recibiría un token revocado en cada llamada.
   */
  it('deja de enviarlo tras cerrar sesión', async () => {
    useSesion.getState().autenticar(ADA, 'token-secreto')
    await cabecerasEnviadas()

    useSesion.getState().cerrarSesion()
    const cabeceras = await cabecerasEnviadas()

    expect(cabeceras.Authorization).toBeUndefined()
  })
})
