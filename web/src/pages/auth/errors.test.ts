import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { generalMessage, fieldMessage } from './errors'

describe('textoDeCampo', () => {
  it('traduce los campos conocidos', () => {
    expect(fieldMessage('email')).toBe('Este correo ya está registrado')
    expect(fieldMessage('name')).toBe('Revisa el nombre')
    expect(fieldMessage('password')).toBe('Revisa la contraseña')
  })

  it('tiene un texto de reserva para un campo que no conoce', () => {
    expect(fieldMessage('campo_inventado')).toBe('Revisa este dato')
  })
})

describe('mensajeGeneral', () => {
  it('avisa de la falta de conexión cuando no hubo respuesta', () => {
    const message = generalMessage(new ApiError(null, {}, 'Network Error'))

    expect(message).toContain('No se ha podido contactar con el servidor')
  })

  it('da un texto propio ante un 401', () => {
    const message = generalMessage(new ApiError(401, {}, 'Unauthenticated.'))

    expect(message).toBe('El correo o la contraseña no son correctos.')
  })

  /*
   * Cuando el 422 identifica los campos, el error se pinta bajo cada uno y el
   * banner sobra. Duplicarlo sería ruido.
   */
  it('no devuelve banner si el 422 trae campos identificados', () => {
    const message = generalMessage(new ApiError(422, { email: ['tomado'] }, 'Inválido'))

    expect(message).toBeNull()
  })

  it('sí devuelve banner si el 422 no dice qué campo falló', () => {
    const message = generalMessage(new ApiError(422, {}, 'Inválido'))

    expect(message).toBe('Hay algún dato que el servidor no ha aceptado.')
  })

  it('cae en un texto genérico ante un error del servidor', () => {
    const message = generalMessage(new ApiError(500, {}, 'Server Error'))

    expect(message).toBe('Algo ha ido mal. Vuelve a intentarlo en unos segundos.')
  })

  /*
   * Ninguna rama debe devolver el message de la API: son textos en inglés y para
   * desarrolladores. Es la política fijada al cerrar #3, y este test la vigila.
   */
  it('nunca devuelve el mensaje que envió la API', () => {
    const technicalMessage = 'The email has already been taken.'

    for (const estado of [null, 401, 422, 500]) {
      const resultado = generalMessage(new ApiError(estado, {}, technicalMessage))

      expect(resultado).not.toBe(technicalMessage)
    }
  })
})
