import type { ApiError } from '@/lib/api'

/**
 * Textos que ve el usuario ante un error de la API.
 *
 * Los `message` que devuelve la API no se muestran nunca: son para
 * desarrolladores y logs, y llegan en inglés cuando los genera la validación de
 * Laravel. El texto lo decide el cliente a partir del código HTTP y de la clave
 * del campo. Es la política fijada al cerrar el issue #3.
 *
 * Limitación conocida de ese enfoque: la clave del campo dice *qué* campo falló,
 * pero no *por qué*. Aquí se resuelve apoyándose en que zod ya validó formato y
 * longitud antes de enviar, así que un 422 sobre `email` que llega hasta el
 * servidor solo puede ser un correo ya registrado. Si algún día la API devuelve
 * códigos de error estables, este mapeo puede dejar de adivinar.
 */
const TEXTOS_POR_CAMPO: Record<string, string> = {
  email: 'Este correo ya está registrado',
  name: 'Revisa el nombre',
  password: 'Revisa la contraseña',
}

export function textoDeCampo(campo: string): string {
  return TEXTOS_POR_CAMPO[campo] ?? 'Revisa este dato'
}

/**
 * Mensaje del banner. Devuelve null cuando el error pertenece a campos concretos
 * y ya se muestra bajo cada uno.
 */
/**
 * Cuando las credenciales son correctas y aun así la vault no se abre.
 *
 * Es un fallo distinto del de credenciales y por eso tiene texto propio: ahí el
 * usuario puede volver a escribir la contraseña, y aquí no hay nada que reescribir,
 * porque el servidor ya dijo que la contraseña era la buena.
 *
 * No promete que se pueda arreglar, porque puede que no se pueda: si la clave
 * envuelta se corrompió, lo que hay dentro no lo puede recuperar nadie. Decir
 * «inténtalo de nuevo» sería mentir con buena intención.
 */
export const NO_SE_PUEDE_ABRIR_LA_VAULT =
  'Has entrado, pero no hemos podido abrir tu vault con esa contraseña. Tus datos siguen ahí y cifrados; lo que no funciona es la llave.'

export function mensajeGeneral(error: ApiError): string | null {
  if (error.esDeRed) {
    return 'No se ha podido contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'
  }

  if (error.esDeCredenciales) {
    return 'El correo o la contraseña no son correctos.'
  }

  if (error.esDeValidacion) {
    // Un 422 con campos identificados se enseña bajo cada campo. Solo llega al
    // banner si el servidor rechazó algo sin decir cuál.
    return Object.keys(error.erroresPorCampo).length > 0
      ? null
      : 'Hay algún dato que el servidor no ha aceptado.'
  }

  return 'Algo ha ido mal. Vuelve a intentarlo en unos segundos.'
}
