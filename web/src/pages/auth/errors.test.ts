import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { generalMessage, fieldMessage } from './errors'

describe('textoDeCampo', () => {
  it('translates the fields it knows', () => {
    expect(fieldMessage('email')).toBe('Este correo ya está registrado')
    expect(fieldMessage('name')).toBe('Revisa el nombre')
    expect(fieldMessage('password')).toBe('Revisa la contraseña')
  })

  it('has a fallback text for a field it does not know', () => {
    expect(fieldMessage('campo_inventado')).toBe('Revisa este dato')
  })
})

describe('mensajeGeneral', () => {
  it('warns about the lack of connection when there was no response', () => {
    const message = generalMessage(new ApiError(null, {}, 'Network Error'))

    expect(message).toContain('No se ha podido contactar con el servidor')
  })

  it('gives a text of its own for a 401', () => {
    const message = generalMessage(new ApiError(401, {}, 'Unauthenticated.'))

    expect(message).toBe('El correo o la contraseña no son correctos.')
  })

  /*
   * When the 422 identifies the fields, the error is painted under each of them and the
   * banner is redundant. Duplicating it would be noise.
   */
  it('returns no banner when the 422 carries identified fields', () => {
    const message = generalMessage(new ApiError(422, { email: ['tomado'] }, 'Inválido'))

    expect(message).toBeNull()
  })

  it('does return a banner when the 422 does not say which field failed', () => {
    const message = generalMessage(new ApiError(422, {}, 'Inválido'))

    expect(message).toBe('Hay algún dato que el servidor no ha aceptado.')
  })

  it('falls back to a generic text for a server error', () => {
    const message = generalMessage(new ApiError(500, {}, 'Server Error'))

    expect(message).toBe('Algo ha ido mal. Vuelve a intentarlo en unos segundos.')
  })

  /*
   * No branch may return the API's message: those are texts in English and for
   * developers. It is the policy settled when #3 was closed, and this test watches it.
   */
  it('never returns the message the API sent', () => {
    const technicalMessage = 'The email has already been taken.'

    for (const httpStatus of [null, 401, 422, 500]) {
      const result = generalMessage(new ApiError(httpStatus, {}, technicalMessage))

      expect(result).not.toBe(technicalMessage)
    }
  })
})
