import { describe, expect, it } from 'vitest'
import { ALPHABETS, generatePassword } from '@/lib/vault/passwordGenerator'
import { DEFAULT_LENGTH, MAX_LENGTH, MIN_LENGTH, generatorOptions } from './generator'

describe("the popup's generator options", () => {
  it("starts from the web's default length and classes", () => {
    const options = generatorOptions(DEFAULT_LENGTH, true)

    expect(options.length).toBe(20)
    expect(options.classes).toEqual({ lowercase: true, uppercase: true, digits: true, symbols: true })
  })

  it('leaves symbols out when asked, and only them', () => {
    expect(generatorOptions(20, false).classes).toEqual({ lowercase: true, uppercase: true, digits: true, symbols: false })
  })

  it.each([
    ['below the minimum', 3, MIN_LENGTH],
    ['above the maximum', 500, MAX_LENGTH],
    ['with decimals', 12.6, 13],
    ['not a number, as an empty field reads', Number.NaN, DEFAULT_LENGTH],
  ])('clamps a length %s instead of failing', (_, asked, expected) => {
    expect(generatorOptions(asked, true).length).toBe(expected)
  })

  it('gives the generator options it accepts, with or without symbols', () => {
    const plain = generatePassword(generatorOptions(30, false))

    expect(plain).toHaveLength(30)
    expect([...plain].some((character) => ALPHABETS.symbols.includes(character))).toBe(false)
  })
})
