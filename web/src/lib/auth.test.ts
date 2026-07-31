import { describe, expect, it } from 'vitest'
import { esquemaLogin, esquemaRegistro } from './auth'

const REGISTRO_VALIDO = {
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  password: 'contraseña-larga',
  passwordConfirmation: 'contraseña-larga',
}

/** Devuelve los mensajes de error indexados por campo. */
function erroresDe(resultado: ReturnType<typeof esquemaRegistro.safeParse>) {
  if (resultado.success) {
    return {}
  }

  return Object.fromEntries(
    resultado.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('esquemaRegistro', () => {
  it('acepta unos datos correctos', () => {
    expect(esquemaRegistro.safeParse(REGISTRO_VALIDO).success).toBe(true)
  })

  it('exige que las contraseñas coincidan, y señala el campo de confirmación', () => {
    const resultado = esquemaRegistro.safeParse({
      ...REGISTRO_VALIDO,
      passwordConfirmation: 'otra-cosa',
    })

    expect(resultado.success).toBe(false)
    expect(erroresDe(resultado).passwordConfirmation).toBe('Las contraseñas no coinciden')
  })

  it('rechaza un correo con formato inválido', () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, email: 'no-es-un-correo' })

    expect(erroresDe(resultado).email).toBe('Esto no parece un correo válido')
  })

  /*
   * El mínimo coincide con el de RegisterRequest en la API a propósito. Si aquí
   * fuera más laxo, el usuario descubriría el error después de enviar.
   */
  it('rechaza una contraseña de menos de ocho caracteres', () => {
    const resultado = esquemaRegistro.safeParse({
      ...REGISTRO_VALIDO,
      password: 'corta',
      passwordConfirmation: 'corta',
    })

    expect(erroresDe(resultado).password).toBe('Mínimo 8 caracteres')
  })

  it('rechaza un nombre vacío o solo con espacios', () => {
    expect(erroresDe(esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, name: '' })).name).toBe(
      'Escribe tu nombre',
    )
    expect(erroresDe(esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, name: '   ' })).name).toBe(
      'Escribe tu nombre',
    )
  })

  it('recorta los espacios alrededor del correo', () => {
    const resultado = esquemaRegistro.safeParse({
      ...REGISTRO_VALIDO,
      email: '  ada@evault.test  ',
    })

    expect(resultado.success).toBe(true)
    if (resultado.success) {
      expect(resultado.data.email).toBe('ada@evault.test')
    }
  })
})

describe('esquemaLogin', () => {
  it('acepta cualquier par no vacío', () => {
    const resultado = esquemaLogin.safeParse({ email: 'ada@evault.test', password: 'x' })

    expect(resultado.success).toBe(true)
  })

  /*
   * En login no se valida formato ni longitud a propósito: rechazar por formato
   * daría un error distinto al de unas credenciales que no coinciden, y esa
   * diferencia es información sobre qué correos existen.
   */
  it('no exige que el correo tenga formato de correo', () => {
    const resultado = esquemaLogin.safeParse({ email: 'lo-que-sea', password: 'x' })

    expect(resultado.success).toBe(true)
  })

  it('exige que ninguno de los dos venga vacío', () => {
    const resultado = esquemaLogin.safeParse({ email: '', password: '' })

    expect(resultado.success).toBe(false)
  })
})
