import type { ApiError } from '@/lib/api'

/**
 * The texts the user sees when the API returns an error.
 *
 * The `message` values the API returns are never shown: they are for developers and
 * logs, and they arrive in English when Laravel's validation generates them. The text
 * is decided by the client from the HTTP code and the field key. It is the policy
 * settled when issue #3 was closed.
 *
 * A known limitation of that approach: the field key says *which* field failed, but not
 * *why*. It is resolved here by leaning on zod having validated format and length
 * before sending, so a 422 over `email` that reaches the server can only be an
 * already registered address. If the API ever returns stable error codes, this mapping
 * can stop guessing.
 */
const FIELD_MESSAGES: Record<string, string> = {
  email: 'Este correo ya está registrado',
  name: 'Revisa el nombre',
  password: 'Revisa la contraseña',
}

export function fieldMessage(field: string): string {
  return FIELD_MESSAGES[field] ?? 'Revisa este dato'
}

/**
 * The banner's message. It returns null when the error belongs to specific fields and
 * is already shown under each of them.
 */
/**
 * When the credentials are right and the vault still does not open.
 *
 * A different failure from the credentials one, and that is why it has a text of its
 * own: there the user can type the password again, and here there is nothing to retype,
 * because the server already said the password was the right one.
 *
 * It does not promise it can be fixed, because it may not be: if the wrapped key was
 * corrupted, nobody can recover what is inside. Saying «try again» would be lying with
 * good intentions.
 */
export const CANNOT_OPEN_VAULT =
  'Has entrado, pero no hemos podido abrir tu vault con esa contraseña. Tus datos siguen ahí y cifrados; lo que no funciona es la llave.'

export function generalMessage(error: ApiError): string | null {
  if (error.isNetwork) {
    return 'No se ha podido contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'
  }

  if (error.isCredentials) {
    return 'El correo o la contraseña no son correctos.'
  }

  if (error.isValidation) {
    // A 422 with identified fields is shown under each field. It only reaches the
    // banner when the server refused something without saying which.
    return Object.keys(error.fieldErrors).length > 0
      ? null
      : 'Hay algún dato que el servidor no ha aceptado.'
  }

  return 'Algo ha ido mal. Vuelve a intentarlo en unos segundos.'
}
