import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { ErrorDeApi, interpretarError } from './api'

/**
 * Construye un AxiosError con respuesta, como el que produce una petición que
 * llegó al servidor y volvió con un código de error.
 */
function errorConRespuesta(estado: number, datos: unknown): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = {
    status: estado,
    statusText: '',
    data: datos,
    headers,
    config: { headers },
  }

  return error
}

describe('interpretarError', () => {
  it('extrae los errores por campo de un 422', () => {
    const resultado = interpretarError(
      errorConRespuesta(422, {
        message: 'The email has already been taken.',
        errors: { email: ['The email has already been taken.'] },
      }),
    )

    expect(resultado).toBeInstanceOf(ErrorDeApi)
    expect(resultado.estado).toBe(422)
    expect(resultado.esDeValidacion).toBe(true)
    expect(resultado.erroresPorCampo).toEqual({
      email: ['The email has already been taken.'],
    })
  })

  it('reconoce un 401 como error de credenciales', () => {
    const resultado = interpretarError(
      errorConRespuesta(401, { message: 'Las credenciales no son válidas.' }),
    )

    expect(resultado.esDeCredenciales).toBe(true)
    expect(resultado.esDeValidacion).toBe(false)
    expect(resultado.erroresPorCampo).toEqual({})
  })

  /*
   * El caso que más se olvida: la petición ni siquiera llegó. Pasa con la API
   * caída, sin red, o con CORS mal configurado, y hay que distinguirlo de un
   * error del servidor porque el mensaje al usuario es otro.
   */
  it('trata la ausencia de respuesta como error de red', () => {
    const sinRespuesta = new AxiosError('Network Error')

    const resultado = interpretarError(sinRespuesta)

    expect(resultado.esDeRed).toBe(true)
    expect(resultado.estado).toBeNull()
    expect(resultado.esDeCredenciales).toBe(false)
  })

  it('envuelve un error que no viene de axios', () => {
    const resultado = interpretarError(new Error('algo se rompió'))

    expect(resultado).toBeInstanceOf(ErrorDeApi)
    expect(resultado.esDeRed).toBe(true)
    expect(resultado.message).toBe('algo se rompió')
  })

  it('envuelve algo que ni siquiera es un Error', () => {
    const resultado = interpretarError('una cadena suelta')

    expect(resultado).toBeInstanceOf(ErrorDeApi)
    expect(resultado.estado).toBeNull()
  })

  it('no se rompe si el cuerpo del error viene vacío', () => {
    const resultado = interpretarError(errorConRespuesta(500, undefined))

    expect(resultado.estado).toBe(500)
    expect(resultado.erroresPorCampo).toEqual({})
    expect(resultado.esDeValidacion).toBe(false)
    expect(resultado.esDeRed).toBe(false)
  })
})
