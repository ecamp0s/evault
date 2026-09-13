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

/**
 * What the popup says when the entries could not be fetched with the vault already open.
 *
 * An expired token is its own case, and the popup locks on it: the key is still here and
 * the server no longer answers to it — the master password was rotated elsewhere, which
 * revokes every session. Keeping the key would be a vault that looks open and shows
 * nothing.
 */
export function listMessageFor(failure: 'expired' | 'offline' | 'failed'): string {
  switch (failure) {
    case 'expired':
      return 'La sesión ya no es válida, por ejemplo por cambiar la contraseña maestra. Vuelve a desbloquear.'
    case 'offline':
      return 'No hay conexión con la instancia, así que no se pueden traer las entradas.'
    case 'failed':
      return 'No se han podido traer las entradas. Inténtalo de nuevo.'
  }
}

/** What the popup says under the search field. */
export function summaryFor(total: number, shown: number, onThisSite: number, searching: boolean): string {
  if (!searching) {
    return onThisSite === 0 ? 'Ninguna entrada para esta página. Escribe para buscar.' : `Para esta página: ${onThisSite}.`
  }
  if (total === 0) return 'Nada coincide con la búsqueda.'
  if (total > shown) return `${total} coinciden; se muestran ${shown}. Escribe algo más para afinar.`
  return total === 1 ? '1 coincide.' : `${total} coinciden.`
}

/** What the popup says after copying. */
export function copiedMessageFor(field: 'username' | 'password' | 'code', clearSeconds: number): string {
  if (field === 'username') return 'Usuario copiado.'
  const what = field === 'password' ? 'Contraseña copiada' : 'Código copiado'
  return `${what}. Se borrará del portapapeles en ${clearSeconds} segundos.`
}
