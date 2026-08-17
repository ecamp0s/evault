/**
 * CUÁNDO SE BLOQUEA LA VAULT SOLA. Ver ADR-007 y el issue #220.
 *
 * `ADR-007` decidió que la clave viva solo en memoria, y desde #73 recargar la
 * vacía. Lo que no existía era un vencimiento: mientras la pestaña siguiera abierta,
 * la clave se quedaba ahí indefinidamente. Los tokens de sesión sí caducan a las 12
 * horas desde #149, así que estaba endurecida la mitad barata —un token robado da
 * una sesión, no el contenido— y sin endurecer la que guarda los secretos.
 *
 * El comentario de keyInMemory.ts dice que guardar la clave «dejaría entrar a
 * cualquiera que tenga el dispositivo, sin saber la contraseña maestra, que es justo
 * lo que un gestor de contraseñas no puede permitir». No hace falta guardarla en
 * disco para que eso pase: basta con no soltarla.
 *
 * ESTE MÓDULO NO USA TEMPORIZADORES, y ahí está lo que lo hace correcto: son
 * funciones puras sobre marcas de tiempo. El motivo está en el comentario de
 * `idleStateFor`.
 */

/** Cuánto se aguanta sin actividad antes de bloquear. */
export const INACTIVITY_LIMIT_MS = 15 * 60 * 1000

/**
 * Cuándo se avisa, un minuto antes de bloquear.
 *
 * El aviso existe porque el modo de fallo de esta funcionalidad no es que bloquee
 * tarde, es que bloquee mientras alguien está leyendo algo sin tocar el teclado.
 */
export const WARNING_AT_MS = 14 * 60 * 1000

/**
 * Cada cuánto se comprueba el desfase.
 *
 * Corto a propósito y sin coste apreciable: la comprobación es una resta. Lo que
 * decide cuándo se bloquea es la marca de tiempo, no este intervalo, así que su
 * único efecto es la precisión con la que se detecta — hasta 15 segundos de retraso
 * sobre los 15 minutos.
 */
export const CHECK_INTERVAL_MS = 15 * 1000

export type IdleState = 'active' | 'warning' | 'expired'

/**
 * En qué estado está la vault según el tiempo sin actividad.
 *
 * RECIBE EL DESFASE Y NO LO MIDE, y eso es lo que hace que esto funcione en una
 * pestaña de fondo. Un `setTimeout` de quince minutos no vale: los navegadores
 * estrangulan los temporizadores de las pestañas ocultas, así que se dispararía
 * mucho más tarde y el bloqueo llegaría cuando ya no protege de nada — que es el
 * modo de fallo silencioso de esta funcionalidad, porque en desarrollo no se ve.
 *
 * Comparando `Date.now()` contra la última actividad, el estrangulamiento deja de
 * importar: al volver a la pestaña, la cuenta ya está hecha.
 */
export function idleStateFor(idleMs: number): IdleState {
  if (idleMs >= INACTIVITY_LIMIT_MS) {
    return 'expired'
  }

  return idleMs >= WARNING_AT_MS ? 'warning' : 'active'
}

/**
 * Segundos que quedan para el bloqueo, para poder decirlo en el aviso.
 *
 * Se redondea hacia arriba para no anunciar «0 segundos» en el último tramo, y no
 * baja de cero por si el desfase ya pasó del límite.
 */
export function secondsUntilLock(idleMs: number): number {
  return Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - idleMs) / 1000))
}

/**
 * Los eventos que cuentan como actividad.
 *
 * Deliberadamente NO incluyen `mousemove`: el ratón parado encima de una ventana
 * genera eventos con cualquier vibración de la mesa, y con eso la vault de un
 * escritorio no se bloquearía nunca. Lo que cuenta es interacción, no presencia.
 *
 * `keydown` es el que evita el peor efecto colateral: que el bloqueo salte mientras
 * alguien escribe un item y le tire lo que llevaba.
 */
export const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'wheel'] as const
