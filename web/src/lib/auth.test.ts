import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from './auth'

const VALID_REGISTRATION = {
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  password: 'contraseña-larga',
  passwordConfirmation: 'contraseña-larga',
}

/** Returns the error messages indexed by field. */
function errorsOf(result: ReturnType<typeof registerSchema.safeParse>) {
  if (result.success) {
    return {}
  }

  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('registerSchema', () => {
  it('accepts correct data', () => {
    expect(registerSchema.safeParse(VALID_REGISTRATION).success).toBe(true)
  })

  it('requires the passwords to match, and points at the confirmation field', () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTRATION,
      passwordConfirmation: 'otra-cosa',
    })

    expect(result.success).toBe(false)
    expect(errorsOf(result).passwordConfirmation).toBe('Las contraseñas no coinciden')
  })

  it('rejects an email with an invalid format', () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTRATION, email: 'no-es-un-correo' })

    expect(errorsOf(result).email).toBe('Esto no parece un correo válido')
  })

  /*
   * The minimum matches RegisterRequest's in the API on purpose. Were it laxer here, the
   * user would find out about the error after submitting.
   */
  it('rejects a password shorter than eight characters', () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTRATION,
      password: 'corta',
      passwordConfirmation: 'corta',
    })

    expect(errorsOf(result).password).toBe('Mínimo 8 caracteres')
  })

  it('rejects a name that is empty or only spaces', () => {
    expect(errorsOf(registerSchema.safeParse({ ...VALID_REGISTRATION, name: '' })).name).toBe(
      'Escribe tu nombre',
    )
    expect(errorsOf(registerSchema.safeParse({ ...VALID_REGISTRATION, name: '   ' })).name).toBe(
      'Escribe tu nombre',
    )
  })

  it('trims the spaces around the email', () => {
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

describe('loginSchema', () => {
  it('accepts any non-empty pair', () => {
    const result = loginSchema.safeParse({ email: 'ada@evault.test', password: 'x' })

    expect(result.success).toBe(true)
  })

  /*
   * At login neither format nor length is validated, on purpose: rejecting by format
   * would give a different error from the one for credentials that do not match, and
   * that difference is information about which emails exist.
   */
  it('does not require the email to have an email format', () => {
    const result = loginSchema.safeParse({ email: 'lo-que-sea', password: 'x' })

    expect(result.success).toBe(true)
  })

  it('requires neither of the two to come in empty', () => {
    const result = loginSchema.safeParse({ email: '', password: '' })

    expect(result.success).toBe(false)
  })
})
