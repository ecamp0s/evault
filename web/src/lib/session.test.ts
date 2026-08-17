import { beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { api } from './api'
import { useSession, type User } from './session'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: '2026-07-30T00:00:00+00:00', has_recovery_key: false
}

/**
 * Hace una petición real a través del cliente, con un adaptador que la intercepta
 * antes de salir a la red y devuelve la configuración que habría viajado.
 *
 * Sustituir el adaptador y no los interceptores es lo que hace fiable el test:
 * los interceptores se ejecutan de verdad, en su orden real, igual que en la
 * aplicación.
 */
async function sentHeaders(): Promise<Record<string, unknown>> {
  const originalAdapter = api.defaults.adapter
  let captured: InternalAxiosRequestConfig | undefined

  api.defaults.adapter = async (config) => {
    captured = config

    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }

  try {
    await api.get('/loquesea')
  } finally {
    api.defaults.adapter = originalAdapter
  }

  return (captured?.headers ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  useSession.getState().clearSession()
})

describe('store de sesión', () => {
  it('empieza sin usuario ni token', () => {
    expect(useSession.getState().user).toBeNull()
    expect(useSession.getState().token).toBeNull()
  })

  it('guarda usuario y token al autenticar', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    expect(useSession.getState().user).toEqual(ADA)
    expect(useSession.getState().token).toBe('token-secreto')
  })

  it('los borra al cerrar sesión', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')
    useSession.getState().clearSession()

    expect(useSession.getState().user).toBeNull()
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * Este test está invertido respecto a como nació, igual que el del estado vacío
   * de la lista. Comprobaba que la sesión sobreviviera a un refresco, que era lo
   * correcto mientras la API no guardara secretos; desde ADR-007 comprueba lo
   * contrario, y el motivo está argumentado allí: la clave de cifrado no se puede
   * persistir, así que un token que sobreviva mantiene viva una sesión incapaz de
   * enseñar nada, a cambio de que un XSS pueda llevárselo.
   *
   * Si vuelve a fallar, la pregunta no es cómo hacerlo pasar sino quién ha vuelto a
   * meter el token en localStorage.
   */
  it('no persiste el token, para que no sobreviva a un refresco', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    expect(localStorage.getItem('evault.sesion')).not.toContain('token-secreto')
  })

  it('recuerda quién entró, que es lo que convierte recargar en un bloqueo', () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    expect(localStorage.getItem('evault.sesion')).toContain('ada@evault.test')
  })
})

describe('interceptor de 401', () => {
  /**
   * Fuerza una respuesta con el estado indicado a través del cliente real, para
   * que los interceptores de respuesta se ejecuten como en la aplicación.
   */
  async function requestReturning(state: number): Promise<void> {
    const originalAdapter = api.defaults.adapter

    api.defaults.adapter = async (config) => {
      const error = new AxiosError('Request failed') as AxiosError & {
        response: unknown
      }
      error.response = {
        status: state,
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
      api.defaults.adapter = originalAdapter
    }
  }

  it('cierra la sesión cuando el servidor responde 401', async () => {
    useSession.getState().authenticate(ADA, 'token-caducado')

    await requestReturning(401)

    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().user).toBeNull()
  })

  /*
   * Solo el 401 expulsa. Un 500 o un 422 son problemas de la petición concreta,
   * no de la credencial, y cerrar sesión por ellos echaría al usuario cada vez
   * que el servidor tuviera un mal día.
   */
  it('no cierra la sesión ante otros errores', async () => {
    useSession.getState().authenticate(ADA, 'token-bueno')

    await requestReturning(500)
    expect(useSession.getState().token).toBe('token-bueno')

    await requestReturning(422)
    expect(useSession.getState().token).toBe('token-bueno')
  })

  it('no hace nada si ya no había sesión', async () => {
    await requestReturning(401)

    expect(useSession.getState().token).toBeNull()
  })
})

describe('interceptor de Authorization', () => {
  it('no envía la cabecera sin sesión', async () => {
    const requestHeaders = await sentHeaders()

    expect(requestHeaders.Authorization).toBeUndefined()
  })

  it('envía el token como Bearer cuando hay sesión', async () => {
    useSession.getState().authenticate(ADA, 'token-secreto')

    const requestHeaders = await sentHeaders()

    expect(requestHeaders.Authorization).toBe('Bearer token-secreto')
  })

  /*
   * El token se lee del store en cada petición y no se fija una vez al arrancar.
   * Si se fijara, seguiría enviándose después de cerrar sesión y el servidor
   * recibiría un token revocado en cada llamada.
   */
  it('deja de enviarlo tras cerrar sesión', async () => {
    useSession.getState().authenticate(ADA, 'token-secreto')
    await sentHeaders()

    useSession.getState().clearSession()
    const requestHeaders = await sentHeaders()

    expect(requestHeaders.Authorization).toBeUndefined()
  })
})

/*
 * La migración del estado persistido, lo único de este fichero que no existía
 * antes de la migración al inglés (#116).
 *
 * La propiedad guardada en localStorage se llamaba `usuarioRecordado` y ahora se
 * llama `rememberedUser`. Sin el `migrate` del store, quien ya usaba la aplicación
 * abriría el navegador y se encontraría el formulario de entrada en blanco en vez
 * de su pantalla de bloqueo: los datos seguirían ahí, pero bajo un nombre que el
 * código nuevo ya no busca.
 *
 * No es un fallo que dé la cara en desarrollo, porque un clon nuevo nunca tiene el
 * formato viejo. Por eso estos tests lo escriben a mano, y lo escriben SIN el campo
 * `version`: así es exactamente como está guardado hoy, porque el store no
 * declaraba versión ninguna cuando se escribió. Inventarle un `version: 0` haría
 * pasar el test dejando el fallo vivo.
 */
describe('migración del usuario recordado', () => {
  /*
   * El beforeEach del fichero llama a clearSession(), que a propósito NO olvida al
   * usuario recordado: esa es justo la diferencia entre bloquear y salir. Aquí hay
   * que partir de cero de verdad, o el estado que dejó el test anterior tapa lo que
   * se quiere comprobar.
   */
  beforeEach(() => {
    useSession.setState({ rememberedUser: null })
  })

  it('reconoce a quien fue recordado con el formato anterior al inglés', async () => {
    localStorage.setItem(
      'evault.sesion',
      JSON.stringify({ state: { usuarioRecordado: { name: 'Ada', email: 'ada@evault.test' } } }),
    )

    await useSession.persist.rehydrate()

    expect(useSession.getState().rememberedUser).toEqual({
      name: 'Ada',
      email: 'ada@evault.test',
    })
  })

  it('no inventa un usuario recordado cuando no había nada guardado', async () => {
    localStorage.clear()

    await useSession.persist.rehydrate()

    expect(useSession.getState().rememberedUser).toBeNull()
  })

  /*
   * El formato nuevo no se escribe a mano: se deja que lo escriba el propio store
   * autenticando, y después se comprueba que sabe volver a leerlo. Escribirlo a
   * mano obligaría a suponer qué versión y qué forma usa zustand por dentro, que
   * es exactamente la suposición que hizo fallar la primera versión de esto.
   */
  it('sigue leyendo el formato que él mismo escribe', async () => {
    useSession.getState().authenticate(
      { ...ADA, name: 'Grace Hopper', email: 'grace@evault.test' },
      'un-token',
    )

    // Lo que el store acaba de escribir. Se guarda antes de vaciar el estado,
    // porque vaciarlo también dispara la persistencia y sobrescribiría esto.
    const written = localStorage.getItem('evault.sesion') ?? ''

    useSession.setState({ rememberedUser: null })
    localStorage.setItem('evault.sesion', written)

    await useSession.persist.rehydrate()

    expect(useSession.getState().rememberedUser).toEqual({
      name: 'Grace Hopper',
      email: 'grace@evault.test',
    })
  })
})
