import type { UnlockProblem } from './unlock'

/**
 * What the popup says when unlocking does not work, one sentence per thing the person can
 * do about it. Kept out of popup.ts so the wording is tested and not only looked at.
 *
 * CANCELLED SAYS NOTHING, as in the web's passkey screen: somebody who dismissed Windows
 * Hello changed their mind, and the application arguing with them would be wrong. The
 * price was found in #665 and is worth knowing: WebAuthn also reports a missing
 * authenticator or a timeout as that same error, so a silent popup can occasionally mean
 * «nothing answered». Telling the two apart is not possible from here, by design of the
 * specification.
 */
export function messageFor(problem: UnlockProblem): string | null {
  switch (problem) {
    case 'cancelled':
      return null
    case 'unsupported':
      return 'Este navegador no puede abrir la vault con un passkey. Entra desde la web con tu contraseña maestra.'
    case 'refused':
      return 'La instancia no ha aceptado este passkey. Comprueba el correo, o si lo quitaste, añádelo otra vez desde la web.'
    case 'throttled':
      return 'Demasiados intentos en poco tiempo. Espera un rato antes de volver a probar.'
    case 'offline':
      return 'No hay conexión con la instancia. Sin red, la extensión no puede abrir la vault.'
    case 'mismatch':
      return 'Este passkey no abre la vault de esta cuenta. Entra desde la web con tu contraseña maestra.'
    case 'failed':
      return 'No se ha podido abrir la vault. Inténtalo de nuevo.'
  }
}
