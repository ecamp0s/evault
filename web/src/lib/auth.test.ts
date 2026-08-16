import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from './auth'

const VALID_REGISTRATION = {
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  password: 'contraseña-larga',
  passwordConfirmation: 'contraseña-larga',
}

/** Devuelve los mensajes de error indexados por campo. */
function errorsOf(result: ReturnType<typeof registerSchema.safeParse>) {
  if (result.success) {
    return {}
  }

  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('esquemaRegistro', () => {
  it('acepta unos datos correctos', () => {
    expect(registerSchema.safeParse(VALID_REGISTRATION).success).toBe(true)
  })

  it('exige que las contraseñas coincidan, y señala el campo de confirmación', () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTRATION,
      passwordConfirmation: 'otra-cosa',
    })

    expect(result.success).toBe(false)
    expect(errorsOf(result).passwordConfirmation).toBe('Las contraseñas no coinciden')
  })

  it('rechaza un correo con formato inválido', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTRATION, email: 'no-es-un-correo' })

    expect(errorsOf(result).email).toBe('Esto no parece un correo válido')
  })

  /*
   * El mínimo coincide con el de RegisterRequest en la API a propósito. Si aquí
   * fuera más laxo, el usuario descubriría el error después de enviar.
   */
  it('rechaza una contraseña de menos de ocho caracteres', () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTRATION,
      password: 'corta',
      passwordConfirmation: 'corta',
    })

    expect(errorsOf(result).password).toBe('Mínimo 8 caracteres')
  })

  it('rechaza un nombre vacío o solo con espacios', () => {
    expect(errorsOf(registerSchema.safeParse({ ...VALID_REGISTRATION, name: '' })).name).toBe(
      'Escribe tu nombre',
    )
    expect(errorsOf(registerSchema.safeParse({ ...VALID_REGISTRATION, name: '   ' })).name).toBe(
      'Escribe tu nombre',
    )
  })

  it('recorta los espacios alrededor del correo', () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTRATION,
      email: '  ada@evault.test  ',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('ada@evault.test')
    }
  })
})

describe('esquemaLogin', () => {
  it('acepta cualquier par no vacío', () => {
    const result = loginSchema.safeParse({ email: 'ada@evault.test', password: 'x' })

    expect(result.success).toBe(true)
  })

  /*
   * En login no se valida formato ni longitud a propósito: rechazar por formato
   * daría un error distinto al de unas credenciales que no coinciden, y esa
   * diferencia es información sobre qué correos existen.
   */
  it('no exige que el correo tenga formato de correo', () => {
    const result = loginSchema.safeParse({ email: 'lo-que-sea', password: 'x' })

    expect(result.success).toBe(true)
  })

  it('exige que ninguno de los dos venga vacío', () => {
    const result = loginSchema.safeParse({ email: '', password: '' })

    expect(result.success).toBe(false)
  })
})
