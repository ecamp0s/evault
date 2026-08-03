/**
 * Generador de contraseñas.
 *
 * Encaja en esta iteración por afinidad y no por casualidad: es cliente puro y usa
 * la misma fuente de aleatoriedad con la que se genera la clave de la vault. Si la
 * aplicación existe para que nadie reutilice contraseñas, tiene que ayudar a no
 * reutilizarlas.
 *
 * Dos cosas hay que acertar aquí, y las dos fallan en silencio:
 *
 * 1. La aleatoriedad viene de crypto.getRandomValues y nunca de Math.random, que no
 *    es criptográficamente seguro y produce contraseñas predecibles.
 * 2. La selección de caracteres no puede tener sesgo de módulo. Es pequeño,
 *    invisible mirando el resultado, y reduce la entropía real de cada contraseña.
 *
 * Ninguna de las dos se ve inspeccionando una contraseña generada, así que ambas
 * van con test.
 */

/**
 * Los alfabetos, sin caracteres ambiguos.
 *
 * Fuera van l, I, 1, O, 0: son las confusiones clásicas al leer una contraseña de
 * una pantalla para teclearla en otro dispositivo, que es justo el momento en que
 * un gestor de contraseñas deja de ayudar. El coste en entropía es despreciable
 * frente a lo que aporta.
 */
export const ALPHABETS = {
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  /*
   * Un conjunto conservador a propósito. Comillas, barras y espacios rompen
   * formularios ajenos y scripts de shell más a menudo de lo que aportan, y una
   * contraseña que el sitio de destino rechaza no protege nada.
   */
  symbols: '!#$%&*+-=?@^_',
} as const

export type CharacterClass = keyof typeof ALPHABETS

export interface PasswordOptions {
  length: number
  /** Qué clases de carácter entran. Al menos una tiene que estar activa. */
  classes: Record<CharacterClass, boolean>
}

export const MIN_LENGTH = 8
export const MAX_LENGTH = 64

export const DEFAULT_OPTIONS: PasswordOptions = {
  /*
   * 20 caracteres del alfabeto completo pasan de 120 bits de entropía. Es holgado
   * hoy y sigue siéndolo dentro de bastantes años, y como nadie va a teclear esto
   * a mano, la longitud sale gratis.
   */
  length: 20,
  classes: { lowercase: true, uppercase: true, digits: true, symbols: true },
}

/** Cuando las opciones no pueden producir una contraseña. */
export class InvalidPasswordOptions extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPasswordOptions'
  }
}

/**
 * Un entero aleatorio en [0, max), sin sesgo.
 *
 * El sesgo de módulo es el fallo silencioso de este módulo: `byte % 26` favorece a
 * los primeros caracteres del alfabeto, porque 256 no es múltiplo de 26. Aquí se
 * descartan los valores del último tramo incompleto y se vuelve a tirar, de modo
 * que todos los resultados son igual de probables.
 *
 * El bucle termina: en el peor caso descarta menos de la mitad de los valores, así
 * que la probabilidad de repetir n veces decae exponencialmente.
 */
function randomBelow(max: number): number {
  const limit = Math.floor(256 / max) * max
  const buffer = new Uint8Array(1)

  let value: number

  do {
    crypto.getRandomValues(buffer)
    value = buffer[0] ?? 0
  } while (value >= limit)

  return value % max
}

function randomCharacterFrom(alphabet: string): string {
  return alphabet[randomBelow(alphabet.length)] ?? ''
}

/**
 * Baraja en el sitio con Fisher-Yates, usando la misma fuente aleatoria.
 *
 * Hace falta porque los caracteres que garantizan cada clase se añaden en orden: sin
 * barajar, toda contraseña empezaría por una minúscula seguida de una mayúscula, y
 * eso es estructura que un atacante puede aprovechar.
 */
function shuffle(characters: string[]): void {
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1)

    ;[characters[i], characters[j]] = [characters[j] as string, characters[i] as string]
  }
}

/** Las clases activas, en orden estable. */
function activeClasses(options: PasswordOptions): CharacterClass[] {
  return (Object.keys(ALPHABETS) as CharacterClass[]).filter((name) => options.classes[name])
}

export function generatePassword(options: PasswordOptions): string {
  const active = activeClasses(options)

  if (active.length === 0) {
    throw new InvalidPasswordOptions('Hay que elegir al menos un tipo de carácter')
  }

  if (options.length < active.length) {
    throw new InvalidPasswordOptions(
      'La contraseña es más corta que el número de tipos de carácter elegidos',
    )
  }

  /*
   * Primero uno de cada clase activa, para que «si se pide, aparece» sea cierto y
   * no solo probable. Con veinte caracteres el azar casi siempre los incluiría,
   * pero «casi siempre» no es lo que promete una casilla marcada.
   */
  const characters = active.map((name) => randomCharacterFrom(ALPHABETS[name]))

  const everything = active.map((name) => ALPHABETS[name]).join('')

  while (characters.length < options.length) {
    characters.push(randomCharacterFrom(everything))
  }

  shuffle(characters)

  return characters.join('')
}
