import { describe, expect, it } from 'vitest'
import { SHORT_BELOW, auditPasswords, repeatedGroups } from '@/lib/vault/audit'
import type { Item, ItemContent } from '@/lib/vault/types'

let next = 0

/** An entry with whatever content the case needs, and an id nobody has to think about. */
function item(content: Partial<ItemContent>): Item {
  next += 1

  return {
    id: `item-${next}`,
    vaultId: 'vault-1',
    content: { nombre: `Entrada ${next}`, ...content },
    createdAt: null,
    updatedAt: null,
  }
}

/** A password long enough and varied enough that only the case under test flags it. */
const CLEAN = 'Abcdef23456!xyz'

describe('auditPasswords', () => {
  it('says nothing about a vault whose passwords are fine', () => {
    const audit = auditPasswords([item({ password: CLEAN }), item({ password: 'Zyxwv98765?abc' })])

    expect(audit.flagged).toHaveLength(0)
    expect(audit.counts).toEqual({ repeated: 0, short: 0, weak: 0 })
  })

  describe('repeated', () => {
    it('flags every entry that shares a password, not just the later ones', () => {
      const audit = auditPasswords([
        item({ password: CLEAN }),
        item({ password: CLEAN }),
        item({ password: 'Zyxwv98765?abc' }),
      ])

      expect(audit.counts.repeated).toBe(2)
      expect(audit.flagged.map((one) => one.item.id)).toEqual(['item-3', 'item-4'])
    })

    /*
     * THE NUMBER IS WHAT MAKES IT ACTIONABLE. «Repetida» says something is wrong;
     * «la comparten cuatro entradas» says how much work changing it saves.
     */
    it('says how many entries share it', () => {
      const audit = auditPasswords([
        item({ password: CLEAN }),
        item({ password: CLEAN }),
        item({ password: CLEAN }),
      ])

      expect(audit.flagged.every((one) => one.sharedWith === 3)).toBe(true)
    })

    it('does not treat two entries with no password as sharing one', () => {
      const audit = auditPasswords([item({}), item({})])

      expect(audit.flagged).toHaveLength(0)
      expect(audit.withPassword).toBe(0)
    })

    it('compares exactly, without trimming or lowercasing', () => {
      const audit = auditPasswords([item({ password: CLEAN }), item({ password: ` ${CLEAN}` })])

      expect(audit.counts.repeated).toBe(0)
    })
  })

  /*
   * WRITTEN WITH LENGTHS AND NOT WITH `SHORT_BELOW`. The first version built its
   * passwords out of the constant, so moving the threshold moved the test with it and
   * every value stayed green — a test that passes both ways, which the Iteration 12
   * called worse than no test. Caught by mutating the constant to 6 and watching all
   * eighteen cases pass.
   *
   * The consequence is deliberate: changing the threshold now breaks these, which is
   * what makes moving it a decision somebody takes rather than a number that drifts.
   */
  describe('short', () => {
    it('flags a password of eleven characters', () => {
      const audit = auditPasswords([item({ password: 'Abcde23456!' })])

      expect(audit.flagged[0].findings).toContain('short')
    })

    it('leaves alone one of twelve, which is where the threshold sits', () => {
      const audit = auditPasswords([item({ password: 'Abcde23456!x' })])

      expect(audit.counts.short).toBe(0)
    })

    it('keeps the threshold where the module says it is', () => {
      expect(SHORT_BELOW).toBe(12)
    })
  })

  describe('weak', () => {
    /*
     * ONE CLASS IS THE ONE THING THAT CAN BE SAID WITHOUT A DICTIONARY. These are weak
     * however long they are, and saying so needs no guess about what anybody was
     * thinking.
     */
    it.each([
      ['only lowercase', 'estonoesunacontrasena'],
      ['only digits', '8472619473816'],
      ['only uppercase', 'ESTOTAMPOCOLOES'],
    ])('flags %s, however long it is', (_, password) => {
      expect(auditPasswords([item({ password })]).flagged[0].findings).toContain('weak')
    })

    it('leaves alone a password with two classes', () => {
      expect(auditPasswords([item({ password: 'estonoesunacontrasena4' })]).counts.weak).toBe(0)
    })

    /*
     * AND THE LIMIT OF THIS AUDIT, WRITTEN AS A TEST so nobody reads more into it than
     * it says: «Verano2024!» has three classes and twelve characters, and it is a bad
     * password. Catching it needs a dictionary, which would mean a dependency in the
     * client that serves the JavaScript that encrypts the vault. The audit reports what
     * it can see and does not pretend to score.
     */
    it('does not catch a bad password that looks varied, and does not pretend to', () => {
      expect(auditPasswords([item({ password: 'Verano2024!!' })]).flagged).toHaveLength(0)
    })
  })

  describe('what it counts over', () => {
    it('ignores the entries with no password at all', () => {
      const audit = auditPasswords([item({ password: 'abc' }), item({}), item({ notas: 'una nota' })])

      expect(audit.withPassword).toBe(1)
    })

    it('counts an entry once per finding, and lists it once', () => {
      const audit = auditPasswords([item({ password: 'corta' }), item({ password: 'corta' })])

      expect(audit.flagged).toHaveLength(2)
      expect(audit.flagged[0].findings).toEqual(['repeated', 'short', 'weak'])
      expect(audit.counts).toEqual({ repeated: 2, short: 2, weak: 2 })
    })
  })

  /*
   * IT HAS TO OPEN AS FAST AS THE LIST DOES, which is what the Iteration 11 numbers set
   * as the standard. Comparing every entry against every other would be 68.000
   * comparisons on the real vault; this is two passes over a Map.
   */
  it('handles a vault the size of the real one without comparing everything twice', () => {
    const many = Array.from({ length: 370 }, (_, index) =>
      item({ password: `Abcdef23456!x${index % 40}` }),
    )
    const started = performance.now()
    const audit = auditPasswords(many)

    expect(audit.withPassword).toBe(370)
    expect(performance.now() - started).toBeLessThan(100)
  })
})

describe('repeatedGroups', () => {
  it('groups the entries that share a password, most shared first', () => {
    const groups = repeatedGroups([
      item({ password: 'compartida-a' }),
      item({ password: 'compartida-b' }),
      item({ password: 'compartida-a' }),
      item({ password: 'compartida-a' }),
      item({ password: 'compartida-b' }),
      item({ password: 'suya-propia' }),
    ])

    expect(groups.map((group) => group.items.length)).toEqual([3, 2])
  })

  /*
   * IT HANDS BACK THE ENTRIES, AND THAT IS THE POINT: the screen needs to name them and
   * to open them for editing. The first version of this case asserted the opposite —
   * that the password never came out — and it failed, which is how the claim written
   * above it turned out to be false. The vault is decrypted in memory by then, so
   * withholding one field here would protect nothing.
   *
   * The guarantee that matters, that the SCREEN never paints the shared password, lives
   * where the painting happens and belongs to #422.
   */
  it('hands back the entries, so the screen can name them and open them', () => {
    const groups = repeatedGroups([item({ password: 'secreta' }), item({ password: 'secreta' })])

    expect(groups[0].items.map((one) => one.content.nombre)).toHaveLength(2)
    expect(groups[0].items[0].id).toBeDefined()
  })

  it('leaves out the passwords nobody repeats', () => {
    expect(repeatedGroups([item({ password: 'suya-propia' })])).toHaveLength(0)
  })
})
