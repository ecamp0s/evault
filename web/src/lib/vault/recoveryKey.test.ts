import { describe, expect, it } from 'vitest'
import {
  RECOVERY_ALPHABET,
  RECOVERY_KEY_LENGTH,
  generateRecoveryKey,
  parseRecoveryKey,
} from '@/lib/vault/recoveryKey'
import {
  createVaultKey,
  decrypt,
  deriveKeys,
  deriveRecoveryKeys,
  encrypt,
  openVaultKey,
  wrapVaultKeyForRecovery,
} from '@/lib/vault/crypto'

describe('generating', () => {
  it('produces 256 bits', () => {
    expect(generateRecoveryKey().bytes).toHaveLength(32)
  })

  it('uses only characters of the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const withoutDashes = generateRecoveryKey().formatted.replace(/-/g, '')

      expect([...withoutDashes].every((c) => RECOVERY_ALPHABET.includes(c))).toBe(true)
    }
  })

  /*
   * I, L and O are the ones that get confused when copying by hand, which is exactly
   * what is going to be done with this. If somebody put them back into the alphabet,
   * this test says so before anyone loses access to their vault by reading a one where
   * there was an ell.
   */
  it('never contains characters that get confused with each other', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryKey().formatted).not.toMatch(/[ILOU]/)
    }
  })

  it('generates a different one every time', () => {
    const views = new Set(Array.from({ length: 100 }, () => generateRecoveryKey().formatted))

    expect(views.size).toBe(100)
  })

  it('is shown in groups of four', () => {
    const groups = generateRecoveryKey().formatted.split('-')

    expect(groups.slice(0, -1).every((g) => g.length === 4)).toBe(true)
  })
})

describe('reading what the user types', () => {
  it('recovers the same bytes that were generated', () => {
    const { bytes, formatted } = generateRecoveryKey()
    const parsed = parseRecoveryKey(formatted)

    expect('bytes' in parsed && [...parsed.bytes]).toEqual([...bytes])
  })

  /*
   * Nobody copies respecting the format. Refusing over that would mean picking a fight
   * with someone trying to recover their account, which is the worst moment for it.
   */
  it('accepts lowercase, spaces and stray dashes', () => {
    const { bytes, formatted } = generateRecoveryKey()
    const mangled = `  ${formatted.toLowerCase().replace(/-/g, ' ')}  `

    const parsed = parseRecoveryKey(mangled)

    expect('bytes' in parsed && [...parsed.bytes]).toEqual([...bytes])
  })

  it('says so when a character is missing or left over', () => {
    const { formatted } = generateRecoveryKey()

    expect(parseRecoveryKey(formatted.slice(0, -1))).toEqual({ problem: 'longitud' })
  })

  it('says so when a character is not in the alphabet', () => {
    const { formatted } = generateRecoveryKey()
    const withBadChar = 'I' + formatted.replace(/-/g, '').slice(1)

    expect(parseRecoveryKey(withBadChar)).toEqual({ problem: 'caracteres' })
  })

  /*
   * THE CASE THAT JUSTIFIES THE CHECK CHARACTER.
   *
   * Without it, a key written correctly but for one character would derive a different
   * key and the message would be «your vault cannot be opened», which sounds like the
   * data is lost. With it, the message can be «look over what you typed», which is
   * what is really going on.
   */
  it('catches one changed character', () => {
    const { formatted } = generateRecoveryKey()
    const withoutDashes = formatted.replace(/-/g, '')
    const another = RECOVERY_ALPHABET[(RECOVERY_ALPHABET.indexOf(withoutDashes[0]) + 1) % 32]
    const altered = another + withoutDashes.slice(1)

    expect(parseRecoveryKey(altered)).toEqual({ problem: 'comprobacion' })
  })

  /*
   * Swapping two adjacent characters is caught too, and it is worth saying why,
   * because intuition says otherwise: a sum does not care about order. Here it does,
   * because the sum runs over the BYTES and not over the characters, and each
   * character contributes five bits spread across different bytes; moving it changes
   * the result.
   *
   * No claim of 100 % is made: the check is one character, so one in thirty-two
   * alterations slips through by chance. What slips through is caught afterwards by
   * the wrapper, which does not open.
   */
  it('catches two swapped characters as well', () => {
    let tested = 0
    let detected = 0

    for (let i = 0; i < 60; i++) {
      const withoutDashes = generateRecoveryKey().formatted.replace(/-/g, '')
      const [a, b] = [withoutDashes[0], withoutDashes[1]]

      if (a === b) continue

      tested += 1

      if ('problem' in parseRecoveryKey(b + a + withoutDashes.slice(2))) {
        detected += 1
      }
    }

    expect(tested).toBeGreaterThan(30)
    expect(detected / tested).toBeGreaterThan(0.9)
  })

  it('refuses an empty string', () => {
    expect(parseRecoveryKey('')).toEqual({ problem: 'longitud' })
  })

  it('is the length it claims to be', () => {
    expect(generateRecoveryKey().formatted.replace(/-/g, '')).toHaveLength(
      RECOVERY_KEY_LENGTH + 1,
    )
  })
})

describe('deriving', () => {
  /*
   * The property ADR-010 §2.2 rests on: two values come out of the same key and one
   * does not lead to the other. If somebody made the domain labels equal, this catches
   * it.
   */
  it('produces a wrapping key and a hash different from each other', async () => {
    const { bytes } = generateRecoveryKey()

    const { wrapKey, authHash } = await deriveRecoveryKeys(bytes, 'ada@evault.test')
    const encrypted = await encrypt(wrapKey, 'algo')

    expect(authHash).not.toBe(encrypted.data)
    expect(authHash).toHaveLength(44)
  })

  it('derives the same from the same key and the same email', async () => {
    const { bytes } = generateRecoveryKey()

    const first = await deriveRecoveryKeys(bytes, 'ada@evault.test')
    const second = await deriveRecoveryKeys(bytes, 'ada@evault.test')

    expect(first.authHash).toBe(second.authHash)
    expect(await decrypt(second.wrapKey, await encrypt(first.wrapKey, 'secreto'))).toBe(
      'secreto',
    )
  })

  it('normalises the email the same way as the rest of the project', async () => {
    const { bytes } = generateRecoveryKey()

    const written = await deriveRecoveryKeys(bytes, '  ADA@Evault.test ')
    const plain = await deriveRecoveryKeys(bytes, 'ada@evault.test')

    expect(written.authHash).toBe(plain.authHash)
  })

  it('derives differently for different emails', async () => {
    const { bytes } = generateRecoveryKey()

    const ada = await deriveRecoveryKeys(bytes, 'ada@evault.test')
    const grace = await deriveRecoveryKeys(bytes, 'grace@evault.test')

    expect(ada.authHash).not.toBe(grace.authHash)
  })
})

/*
 * THE TEST THAT JUSTIFIES EVERYTHING ELSE.
 *
 * That the key is generated neatly and derived deterministically counts for nothing if
 * the wrapper it produces does not open the vault. This walks the whole path: a vault
 * is created with its master key, wrapped a second time with the recovery key, and
 * then opened with the recovery key ONLY, with the master password nowhere in sight.
 *
 * It is what a user will do on the day they need it, and on the day they need it there
 * is no second chance.
 */
describe('the complete path', () => {
  it('the recovery key opens the same vault key', async () => {
    const { masterKey } = await deriveKeys('contraseña-larga', 'ada@evault.test')
    const { vaultKey, wrapped } = await createVaultKey(masterKey)

    // Something stored with the usual vault key.
    const saved = await encrypt(vaultKey, 'la contraseña de GitHub')

    const recovery = generateRecoveryKey()
    const { wrapKey } = await deriveRecoveryKeys(recovery.bytes, 'ada@evault.test')
    const wrappedKey = await wrapVaultKeyForRecovery(masterKey, wrapped, wrapKey)

    // From here on only the recovery key is used: no master password and no master
    // key, which is the real situation of whoever has lost it.
    const parsedKey = parseRecoveryKey(recovery.formatted)
    if (!('bytes' in parsedKey)) throw new Error('la clave recién generada no se pudo leer')

    const onlyWithKey = await deriveRecoveryKeys(parsedKey.bytes, 'ada@evault.test')
    const opened = await openVaultKey(onlyWithKey.wrapKey, wrappedKey)

    expect(await decrypt(opened, saved)).toBe('la contraseña de GitHub')
  })

  it('a different recovery key opens nothing', async () => {
    const { masterKey } = await deriveKeys('contraseña-larga', 'ada@evault.test')
    const { wrapped } = await createVaultKey(masterKey)

    const good = generateRecoveryKey()
    const other = generateRecoveryKey()

    const wrappedKey = await wrapVaultKeyForRecovery(
      masterKey,
      wrapped,
      (await deriveRecoveryKeys(good.bytes, 'ada@evault.test')).wrapKey,
    )

    const withTheOther = await deriveRecoveryKeys(other.bytes, 'ada@evault.test')

    await expect(openVaultKey(withTheOther.wrapKey, wrappedKey)).rejects.toThrow()
  })
})
