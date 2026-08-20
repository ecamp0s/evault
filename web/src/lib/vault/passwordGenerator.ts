/**
 * Password generator.
 *
 * It belongs in this iteration by affinity and not by chance: it is pure client and
 * uses the same source of randomness the vault key is generated from. If the
 * application exists so that nobody reuses passwords, it has to help not to reuse
 * them.
 *
 * Two things have to be right here, and both fail silently:
 *
 * 1. The randomness comes from crypto.getRandomValues and never from Math.random,
 *    which is not cryptographically secure and yields predictable passwords.
 * 2. The choice of characters must have no modulo bias. It is small, invisible when
 *    looking at the result, and it lowers the real entropy of every password.
 *
 * Neither shows by inspecting a generated password, so both come with a test.
 */

/**
 * The alphabets, without ambiguous characters.
 *
 * Out go l, I, 1, O, 0: the classic confusions when reading a password off one screen
 * to type it into another device, which is exactly the moment a password manager stops
 * helping. The cost in entropy is negligible next to what it buys.
 */
export const ALPHABETS = {
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  /*
   * A deliberately conservative set. Quotes, slashes and spaces break other people's
   * forms and shell scripts more often than they contribute, and a password the
   * destination site refuses protects nothing.
   */
  symbols: '!#$%&*+-=?@^_',
} as const

export type CharacterClass = keyof typeof ALPHABETS

export interface PasswordOptions {
  length: number
  /** Which character classes take part. At least one has to be active. */
  classes: Record<CharacterClass, boolean>
}

export const MIN_LENGTH = 8
export const MAX_LENGTH = 64

export const DEFAULT_OPTIONS: PasswordOptions = {
  /*
   * 20 characters of the full alphabet go past 120 bits of entropy. That is generous
   * today and stays generous for many years, and since nobody is going to type this by
   * hand, the length comes free.
   */
  length: 20,
  classes: { lowercase: true, uppercase: true, digits: true, symbols: true },
}

/** When the options cannot produce a password. */
export class InvalidPasswordOptions extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPasswordOptions'
  }
}

/**
 * A random integer in [0, max), with no bias.
 *
 * Modulo bias is this module's silent failure: `byte % 26` favours the first
 * characters of the alphabet, because 256 is not a multiple of 26. Here the values of
 * the last incomplete stretch are discarded and the die is thrown again, so that every
 * outcome is equally likely.
 *
 * The loop terminates: in the worst case it discards fewer than half the values, so
 * the probability of repeating n times decays exponentially.
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
 * Shuffles in place with Fisher-Yates, using the same random source.
 *
 * It is needed because the characters guaranteeing each class are appended in order:
 * without shuffling, every password would start with a lowercase letter followed by an
 * uppercase one, and that is structure an attacker can exploit.
 */
function shuffle(characters: string[]): void {
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1)

    ;[characters[i], characters[j]] = [characters[j] as string, characters[i] as string]
  }
}

/** The active classes, in a stable order. */
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
   * One of each active class first, so that «if you ask for it, it turns up» is true
   * and not merely likely. With twenty characters chance would almost always include
   * them, but «almost always» is not what a ticked box promises.
   */
  const characters = active.map((name) => randomCharacterFrom(ALPHABETS[name]))

  const everything = active.map((name) => ALPHABETS[name]).join('')

  while (characters.length < options.length) {
    characters.push(randomCharacterFrom(everything))
  }

  shuffle(characters)

  return characters.join('')
}
