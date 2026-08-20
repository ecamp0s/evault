import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALPHABETS,
  DEFAULT_OPTIONS,
  InvalidPasswordOptions,
  type PasswordOptions,
  generatePassword,
} from './passwordGenerator'

/*
 * The two failures this module can have do not show by looking at a generated
 * password: using a weak random source, and biasing the choice of characters. A biased
 * password looks perfectly random to the eye and carries less entropy than it appears
 * to, so these tests are the only way to know it is not happening.
 */

function withClasses(...activeOnes: (keyof typeof ALPHABETS)[]): PasswordOptions {
  return {
    length: 20,
    classes: {
      lowercase: activeOnes.includes('lowercase'),
      uppercase: activeOnes.includes('uppercase'),
      digits: activeOnes.includes('digits'),
      symbols: activeOnes.includes('symbols'),
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the source of randomness', () => {
  /*
   * Math.random is not cryptographically secure: its state can be reconstructed by
   * watching a handful of outputs, and with it the next ones predicted. In a password
   * generator that is not an academic nicety.
   */
  it('is crypto.getRandomValues and not Math.random', () => {
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues')
    const math = vi.spyOn(Math, 'random')

    generatePassword(DEFAULT_OPTIONS)

    expect(cryptoSpy).toHaveBeenCalled()
    expect(math).not.toHaveBeenCalled()
  })
})

describe('the choice of characters carries no bias', () => {
  /*
   * The test that really catches modulo bias, and it is deterministic rather than
   * statistical. A first version measured the distribution over a large sample and did
   * NOT catch the failure: with a 25-character alphabet the bias is around 10 %, and
   * any margin wide enough not to fail by chance lets it through.
   *
   * So instead of measuring the output it controls the input. The lowercase alphabet
   * has 25 characters, so the largest multiple of 25 that fits in a byte is 250: the
   * values 250 to 255 fall in the incomplete stretch and have to be discarded. A
   * correct implementation rolls again; one using `byte % 25` returns 250 % 25 = 0,
   * that is, the first letter of the alphabet.
   */
  it('discards the values that would bias instead of taking them modulo', () => {
    const sequence = [250, 251, 7]
    let call = 0

    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((buffer: Uint8Array) => {
      buffer[0] = sequence[call] ?? 7
      call += 1

      return buffer
    }) as typeof crypto.getRandomValues)

    const generated = generatePassword({
      length: 1,
      classes: { lowercase: true, uppercase: false, digits: false, symbols: false },
    })

    // With bias it would come out as 'a', which is ALPHABETS.lowercase[250 % 25] = [0].
    expect(generated).toBe(ALPHABETS.lowercase[7])
    expect(generated).not.toBe(ALPHABETS.lowercase[0])
    expect(call).toBe(3)
  })

  it('uses the whole alphabet and not just its beginning', () => {
    const alphabet = ALPHABETS.lowercase
    const generatedKeys = Array.from({ length: 200 }, () =>
      generatePassword({ length: 25, classes: { ...withClasses('lowercase').classes } }),
    ).join('')

    for (const char of alphabet) {
      expect(generatedKeys).toContain(char)
    }
  })

  /*
   * The characters guaranteeing each class are appended in order, so without shuffling
   * EVERY password would start with a lowercase letter, carry on with an uppercase
   * one, and so forth. That is predictable structure that cuts an attacker's work.
   *
   * It looks at the CLASS of the first character and not at the character: a first
   * version counted distinct characters and did not catch the failure, because without
   * shuffling the first one is still any lowercase letter out of twenty-five.
   */
  it('does not always leave the same class in the first position', () => {
    const initialClasses = new Set(
      Array.from({ length: 80 }, () => {
        const firstOne = generatePassword(DEFAULT_OPTIONS)[0] ?? ''

        return (Object.keys(ALPHABETS) as (keyof typeof ALPHABETS)[]).find((cssClass) =>
          ALPHABETS[cssClass].includes(firstOne),
        )
      }),
    )

    expect(initialClasses.size).toBeGreaterThan(1)
  })

  it('does not always leave the same class in the second either', () => {
    const secondOnes = new Set(
      Array.from({ length: 80 }, () => {
        const secondOne = generatePassword(DEFAULT_OPTIONS)[1] ?? ''

        return (Object.keys(ALPHABETS) as (keyof typeof ALPHABETS)[]).find((cssClass) =>
          ALPHABETS[cssClass].includes(secondOne),
        )
      }),
    )

    expect(secondOnes.size).toBeGreaterThan(1)
  })
})

describe('what each option promises', () => {
  it('the length asked for is the length obtained', () => {
    for (const length of [8, 12, 20, 33, 64]) {
      expect(generatePassword({ ...DEFAULT_OPTIONS, length })).toHaveLength(length)
    }
  })

  /*
   * If a box is ticked, that class turns up always and not «almost always». With twenty
   * characters chance would include it near enough for sure, but that is not what a
   * ticked box promises, and at short lengths it stops being true.
   */
  it.each([
    ['lowercase' as const],
    ['uppercase' as const],
    ['digits' as const],
    ['symbols' as const],
  ])('si se pide %s, aparece siempre, incluso en contraseñas cortas', (cssClass) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const generated = generatePassword({ ...withClasses(cssClass, 'lowercase'), length: 8 })

      expect([...generated].some((character) => ALPHABETS[cssClass].includes(character))).toBe(true)
    }
  })

  it('does not use characters of a class that was not asked for', () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const generated = generatePassword(withClasses('lowercase', 'digits'))

      expect(generated).toMatch(/^[abcdefghijkmnopqrstuvwxyz23456789]+$/)
    }
  })

  /*
   * Out go l, I, 1, O and 0: the classic confusions when reading a password off one
   * screen to type it into another device.
   */
  it('never produces ambiguous characters', () => {
    const generatedKeys = Array.from({ length: 100 }, () => generatePassword(DEFAULT_OPTIONS)).join('')

    for (const ambiguous of ['l', 'I', '1', 'O', '0']) {
      expect(generatedKeys).not.toContain(ambiguous)
    }
  })

  it('two passwords in a row do not match', () => {
    const generatedKeys = new Set(Array.from({ length: 50 }, () => generatePassword(DEFAULT_OPTIONS)))

    expect(generatedKeys.size).toBe(50)
  })
})

describe('options that cannot produce a password', () => {
  it('with no class active, it fails instead of returning something empty', () => {
    expect(() =>
      generatePassword({ length: 20, classes: { lowercase: false, uppercase: false, digits: false, symbols: false } }),
    ).toThrow(InvalidPasswordOptions)
  })

  /*
   * Four classes do not fit into three characters. Failing beats returning a password
   * that silently breaks what the boxes promise.
   */
  it('when the length does not fit every class asked for, it fails', () => {
    expect(() => generatePassword({ ...DEFAULT_OPTIONS, length: 3 })).toThrow(
      InvalidPasswordOptions,
    )
  })
})
