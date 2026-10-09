/**
 * The options of the popup's password generator (#792), over the web's own generator: the
 * popup compiles web/src/lib/vault/passwordGenerator.ts and does not copy it, as it does
 * with the rest of lib/vault.
 *
 * TWO CONTROLS AND NO MORE: the length and whether there are symbols, the one class a site
 * is most likely to refuse. Everything else is the web's default. Nothing is remembered —
 * the web keeps its choices in its own storage, and a popup that is destroyed every time it
 * closes would need a second copy of them for very little.
 */
import { DEFAULT_OPTIONS, MAX_LENGTH, MIN_LENGTH, type PasswordOptions } from '@/lib/vault/passwordGenerator'

export const DEFAULT_LENGTH = DEFAULT_OPTIONS.length

/**
 * What the two controls ask for, as options the generator accepts.
 *
 * The length is clamped instead of refused: it comes from a number field somebody may be
 * halfway through typing, and «8» on the way to «80» must still produce a password rather
 * than an error.
 */
export function generatorOptions(length: number, symbols: boolean): PasswordOptions {
  const whole = Number.isFinite(length) ? Math.round(length) : DEFAULT_LENGTH

  return {
    length: Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, whole)),
    classes: { ...DEFAULT_OPTIONS.classes, symbols },
  }
}

export { MAX_LENGTH, MIN_LENGTH }
