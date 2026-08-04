/**
 * El formato con el que una persona custodia su clave de recuperación.
 *
 * La criptografía está en crypto.ts; esto es solo la traducción entre 256 bits y
 * algo que se pueda copiar en un papel sin equivocarse. Suena menor y no lo es: una
 * clave mal transcrita no se descubre el día que se guarda, sino el día que hace
 * falta, y ese día ya no hay otra vía. Ver ADR-010 §2.4.
 */

/**
 * Base32 sin caracteres ambiguos.
 *
 * Faltan la I, la L, la O y la U. Las tres primeras porque se confunden con el uno
 * y el cero al leerlas escritas a mano, que es exactamente lo que va a pasar con
 * esto. La U se descarta además para que ninguna combinación forme palabras
 * malsonantes, que es la razón por la que Crockford la quitó de su alfabeto y este
 * es el mismo.
 *
 * Es la misma decisión que tomó el generador de contraseñas en #85 al descartar los
 * caracteres ambiguos, aplicada a algo que sí se va a copiar a mano.
 */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Bits que codifica cada carácter del alfabeto. */
const BITS_PER_CHAR = 5

/** Longitud del bloque en que se agrupa, para que se lea de un vistazo. */
const GROUP_SIZE = 4

/** 256 bits en base32 son 52 caracteres, más uno de comprobación. */
export const RECOVERY_KEY_LENGTH = 52

/**
 * Un secreto de recuperación recién generado.
 *
 * Los bytes sirven para derivar; el texto es lo que ve y guarda el usuario. Se
 * devuelven juntos para que nadie tenga que volver a decodificar lo que acaba de
 * generar, que es una conversión de ida y vuelta más donde equivocarse.
 */
export interface GeneratedRecoveryKey {
  bytes: Uint8Array<ArrayBuffer>
  /** Con los grupos separados por guiones, tal y como hay que enseñarlo. */
  formatted: string
}

/**
 * El carácter de comprobación: la suma de todos los bytes, en el alfabeto.
 *
 * No protege de nada malicioso y no lo pretende. Lo que hace es distinguir «esto
 * está mal escrito» de «esto no abre tu vault», que son dos mensajes muy distintos:
 * el primero invita a repasar el papel y el segundo a rendirse. La Iteración 3 ya
 * aprendió esa distinción con «credenciales incorrectas» frente a «no se puede
 * abrir la vault».
 */
function checksumChar(bytes: Uint8Array): string {
  let sum = 0

  for (const byte of bytes) {
    sum = (sum + byte) % RECOVERY_ALPHABET.length
  }

  return RECOVERY_ALPHABET[sum]
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let salida = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= BITS_PER_CHAR) {
      salida += RECOVERY_ALPHABET[(value >>> (bits - BITS_PER_CHAR)) & 31]
      bits -= BITS_PER_CHAR
    }
  }

  // Los bits que sobran se rellenan por la derecha: 256 no es múltiplo de 5.
  if (bits > 0) {
    salida += RECOVERY_ALPHABET[(value << (BITS_PER_CHAR - bits)) & 31]
  }

  return salida
}

/** Agrupa de cuatro en cuatro con guiones. */
export function groupRecoveryKey(key: string): string {
  return (key.match(new RegExp(`.{1,${GROUP_SIZE}}`, 'g')) ?? []).join('-')
}

/**
 * Genera una clave de recuperación nueva.
 *
 * Los 256 bits salen de crypto.getRandomValues y de ningún otro sitio. No hay KDF
 * detrás que compense una generación pobre, así que si esto dejara de ser aleatorio
 * de verdad, la recuperación pasaría a ser el eslabón atacable del producto entero.
 * Es la consecuencia 6 de ADR-010.
 */
export function generateRecoveryKey(): GeneratedRecoveryKey {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const texto = toBase32(bytes) + checksumChar(bytes)

  return { bytes, formatted: groupRecoveryKey(texto) }
}

/** Lo que puede fallar al leer una clave escrita a mano. */
export type RecoveryKeyProblem = 'longitud' | 'caracteres' | 'comprobacion'

/**
 * Interpreta lo que el usuario ha escrito.
 *
 * Acepta minúsculas, espacios y guiones porque nadie copia respetando el formato, y
 * rechazarlo por eso sería pelearse con quien está intentando recuperar su cuenta.
 * Lo que no hace es adivinar: si el carácter de comprobación no cuadra, lo dice en
 * vez de intentar derivar con algo que casi seguro está mal.
 */
export function parseRecoveryKey(
  input: string,
): { bytes: Uint8Array<ArrayBuffer> } | { problem: RecoveryKeyProblem } {
  const limpio = input.toUpperCase().replace(/[\s-]/g, '')

  if (limpio.length !== RECOVERY_KEY_LENGTH + 1) {
    return { problem: 'longitud' }
  }

  const cuerpo = limpio.slice(0, RECOVERY_KEY_LENGTH)
  const comprobacion = limpio.slice(RECOVERY_KEY_LENGTH)

  if ([...limpio].some((c) => !RECOVERY_ALPHABET.includes(c))) {
    return { problem: 'caracteres' }
  }

  const bytes = new Uint8Array(32)
  let bits = 0
  let value = 0
  let escritos = 0

  for (const c of cuerpo) {
    value = (value << BITS_PER_CHAR) | RECOVERY_ALPHABET.indexOf(c)
    bits += BITS_PER_CHAR

    if (bits >= 8) {
      bytes[escritos] = (value >>> (bits - 8)) & 0xff
      escritos += 1
      bits -= 8
    }
  }

  if (checksumChar(bytes) !== comprobacion) {
    return { problem: 'comprobacion' }
  }

  return { bytes }
}
