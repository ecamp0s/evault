import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { ApiError, interpretError } from './api'

/**
 * Construye un AxiosError con respuesta, como el que produce una petición que
 * llegó al servidor y volvió con un código de error.
 */
function errorConRespuesta(state: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = {
    status: state,
    statusText: '',
    data: data,
    headers,
    config: { headers },
  }

  return error
}

describe('interpretarError', () => {
  it('extrae los errores por campo de un 422', () => {
    const result = interpretError(
      errorConRespuesta(422, {
        message: 'The email has already been taken.',
        errors: { email: ['The email has already been taken.'] },
      }),
    )

    expect(result).toBeInstanceOf(ApiError)
    expect(result.state).toBe(422)
    expect(result.isValidation).toBe(true)
    expect(result.fieldErrors).toEqual({
      email: ['The email has already been taken.'],
    })
  })

  it('reconoce un 401 como error de credenciales', () => {
    const result = interpretError(
      errorConRespuesta(401, { message: 'Las credenciales no son válidas.' }),
    )

    expect(result.isCredentials).toBe(true)
    expect(result.isValidation).toBe(false)
    expect(result.fieldErrors).toEqual({})
  })

  /*
   * El caso que más se olvida: la petición ni siquiera llegó. Pasa con la API
   * caída, sin red, o con CORS mal configurado, y hay que distinguirlo de un
   * error del servidor porque el mensaje al usuario es otro.
   */
  it('trata la ausencia de respuesta como error de red', () => {
    const sinRespuesta = new AxiosError('Network Error')

    const result = interpretError(sinRespuesta)

    expect(result.isNetwork).toBe(true)
    expect(result.state).toBeNull()
    expect(result.isCredentials).toBe(false)
  })

  it('envuelve un error que no viene de axios', () => {
    const result = interpretError(new Error('algo se rompió'))

    expect(result).toBeInstanceOf(ApiError)
    expect(result.isNetwork).toBe(true)
    expect(result.message).toBe('algo se rompió')
  })

  it('envuelve algo que ni siquiera es un Error', () => {
    const result = interpretError('una cadena suelta')

    expect(result).toBeInstanceOf(ApiError)
    expect(result.state).toBeNull()
  })

  it('no se rompe si el cuerpo del error viene vacío', () => {
    const result = interpretError(errorConRespuesta(500, undefined))

    expect(result.state).toBe(500)
    expect(result.fieldErrors).toEqual({})
    expect(result.isValidation).toBe(false)
    expect(result.isNetwork).toBe(false)
  })
})
