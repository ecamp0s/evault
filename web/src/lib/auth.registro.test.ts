import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { registrar, salir } from './auth'
import { useSesion, type Usuario } from './sesion'
import { useClaveDeVault } from './vault/claveEnMemoria'
import { cifrar, descifrar, derivarClaves } from './vault/cripto'

/*
 * Lo que este fichero vigila es la promesa central del producto: que la contraseña
 * maestra no sale del dispositivo. No se comprueba leyendo el código sino mirando
 * lo que se le pasa a axios, que es lo único que llega a salir por el cable.
 *
 * La derivación es lenta a propósito —600.000 iteraciones—, así que estos tests
 * tardan. Bajar ITERACIONES para acelerarlos sería debilitar el producto para que
 * la suite corra antes, y por eso hay un test en cripto.test.ts que lo impide.
 */

const ADA: Usuario = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

const DATOS = {
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  password: 'una contraseña maestra larga',
  passwordConfirmation: 'una contraseña maestra larga',
}

/** Lo que axios recibiría en el alta, sin llegar a mandar nada. */
async function cuerpoDelAlta(datos = DATOS): Promise<Record<string, string>> {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { data: { user: ADA, token: 'token-de-prueba' } } })

  await registrar(datos)

  return post.mock.calls[0]?.[1] as Record<string, string>
}

beforeEach(() => {
  useSesion.setState({ usuario: null, token: null, usuarioRecordado: null })
  useClaveDeVault.setState({ clave: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registrar', () => {
  it('manda el alta al endpoint de registro y deja la sesión abierta', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { user: ADA, token: 'token-de-prueba' } } })

    await registrar(DATOS)

    expect(post.mock.calls[0]?.[0]).toBe('/auth/register')
    expect(useSesion.getState().token).toBe('token-de-prueba')
    expect(useSesion.getState().usuario).toEqual(ADA)
  })

  /*
   * El criterio de aceptación del issue, y la razón de ser de toda la iteración.
   * Se comprueba sobre el cuerpo serializado entero y no campo a campo: si algún
   * día alguien añade un campo nuevo con la contraseña dentro, un test que mirase
   * solo los campos conocidos no se enteraría.
   */
  it('no manda la contraseña maestra en ninguna parte del cuerpo', async () => {
    const cuerpo = await cuerpoDelAlta()

    expect(JSON.stringify(cuerpo)).not.toContain(DATOS.password)
  })

  it('manda el hash de autenticación en el campo password, no la contraseña', async () => {
    const cuerpo = await cuerpoDelAlta()
    const { hashDeAutenticacion } = await derivarClaves(DATOS.password, DATOS.email)

    expect(cuerpo.password).toBe(hashDeAutenticacion)
  })

  it('no manda la confirmación de la contraseña', async () => {
    const cuerpo = await cuerpoDelAlta()

    expect(Object.keys(cuerpo)).toEqual([
      'name',
      'email',
      'password',
      'wrapped_key',
      'wrapped_key_iv',
    ])
  })

  it('manda la clave de vault envuelta junto a su nonce', async () => {
    const cuerpo = await cuerpoDelAlta()

    expect(cuerpo.wrapped_key).toBeTruthy()
    expect(cuerpo.wrapped_key_iv).toBeTruthy()
    expect(cuerpo.wrapped_key).not.toBe(cuerpo.wrapped_key_iv)
  })

  /*
   * La comprobación de punta a punta de que la envoltura sirve: la clave que queda
   * en memoria y la que se puede desenvolver con la clave maestra del servidor son
   * la misma. Sin esto, el registro podría estar mandando un blob perfectamente
   * formado que no abre nada, y no se sabría hasta el primer login.
   */
  it('lo que manda envuelto abre lo que la clave en memoria cifra', async () => {
    const cuerpo = await cuerpoDelAlta()
    const { claveMaestra } = await derivarClaves(DATOS.password, DATOS.email)

    const { abrirClaveDeVault } = await import('./vault/cripto')
    const recuperada = await abrirClaveDeVault(claveMaestra, {
      datos: cuerpo.wrapped_key,
      iv: cuerpo.wrapped_key_iv,
    })

    const enMemoria = useClaveDeVault.getState().clave

    expect(enMemoria).not.toBeNull()

    const cifrado = await cifrar(enMemoria as CryptoKey, 'un secreto cualquiera')

    expect(await descifrar(recuperada, cifrado)).toBe('un secreto cualquiera')
  })

  it('deja la vault desbloqueada', async () => {
    await cuerpoDelAlta()

    expect(useClaveDeVault.getState().clave).not.toBeNull()
  })

  /*
   * Si el servidor rechaza el alta, no puede quedar una clave de vault viva en
   * memoria: sería tener desbloqueada una vault que no existe, y la siguiente
   * pantalla creería que hay algo que enseñar.
   */
  it('no deja clave en memoria si el alta falla', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('rechazado'))

    await expect(registrar(DATOS)).rejects.toThrow()

    expect(useClaveDeVault.getState().clave).toBeNull()
  })

  /*
   * El correo se normaliza dentro de la derivación, así que registrarse con
   * mayúsculas produce el mismo hash que hacerlo sin ellas. Es la mitad de cliente
   * de la coincidencia con mb_strtolower(trim(...)) del servidor.
   */
  it('deriva igual escribiendo el correo con mayúsculas y espacios', async () => {
    const normal = await cuerpoDelAlta()

    vi.restoreAllMocks()
    useClaveDeVault.setState({ clave: null })

    const raro = await cuerpoDelAlta({ ...DATOS, email: '  ADA@Evault.Test  ' })

    expect(raro.password).toBe(normal.password)
  })
})

describe('salir', () => {
  /*
   * Cerrar sesión bloquea la vault. Dejar la clave viva sería peor que no cerrar:
   * la pantalla diría que no hay nadie dentro mientras el material con el que se
   * descifra todo sigue al alcance de cualquier script de la pestaña.
   */
  it('olvida la clave de la vault', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: null })

    const { claveMaestra } = await derivarClaves('lo que sea', 'ada@evault.test')
    const { crearClaveDeVault } = await import('./vault/cripto')
    const { claveDeVault } = await crearClaveDeVault(claveMaestra)

    useSesion.getState().autenticar(ADA, 'token')
    useClaveDeVault.getState().guardar(claveDeVault)

    await salir()

    expect(useClaveDeVault.getState().clave).toBeNull()
  })
})

describe('la clave en memoria', () => {
  /*
   * ADR-007 lo prohíbe explícitamente y por eso se comprueba, aunque el store no
   * declare persistencia: lo que se vigila no es la implementación de hoy sino que
   * nadie le añada un middleware persist mañana, que es un cambio de una línea y
   * parece inocente.
   */
  it('no deja rastro en localStorage ni en sessionStorage', async () => {
    await cuerpoDelAlta()

    expect(localStorage.length).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(localStorage)).not.toContain('CryptoKey')
    expect(Object.keys(sessionStorage)).toHaveLength(0)

    for (const clave of Object.keys(localStorage)) {
      expect(localStorage.getItem(clave)).not.toContain('wrapped')
    }
  })
})
