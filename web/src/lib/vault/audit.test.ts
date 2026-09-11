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
    content: { name: `Entrada ${next}`, ...content },
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
      const audit = auditPasswords([item({ password: 'abc' }), item({}), item({ notes: 'una nota' })])

      expect(audit.withPassword).toBe(1)
    })

    /*
     * THE CLAIM ABOUT THE OTHER TWO KINDS OF ENTRY, WHICH DID NOT EXIST WHEN IT WAS
     * WRITTEN. The module's header has said since #421 that «a card number or a note
     * kept in the vault has nothing to say here»; ADR-020 made both real, and an
     * assertion about a case that cannot occur is not a guarantee, it is a plan.
     *
     * The mechanism that holds it is that neither carries a `password`, so the two loops
     * skip them — the exclusion the four tests around this one already defend. What
     * these add is the shape: a card is not audited BECAUSE OF ITS NUMBER either, which
     * looks like a secret and is not a password.
     */
    it('does not audit a card, not even by its number', () => {
      const audit = auditPasswords([
        item({ password: CLEAN }),
        item({ type: 'card', number: '4111', csc: '123', pin: '1234' }),
      ])

      expect(audit.withPassword).toBe(1)
      expect(audit.flagged).toHaveLength(0)
    })

    it('does not audit a note', () => {
      const audit = auditPasswords([
        item({ password: CLEAN }),
        item({ type: 'note', notes: 'izquierda 12, derecha 4' }),
      ])

      expect(audit.withPassword).toBe(1)
    })

    /*
     * AND THE PART THAT WOULD BREAK SILENTLY: `withPassword` is the denominator of every
     * proportion the screen reports, so a vault that gains fifty notes must report
     * exactly what it reported before. If the notes were counted, the audit would look
     * like it improved without a single password having changed — the most convincing
     * way this screen could lie.
     */
    it('reports the same numbers after the vault fills up with cards and notes', () => {
      const passwords = [item({ password: 'corta' }), item({ password: 'corta' })]
      const before = auditPasswords(passwords)

      const others = Array.from({ length: 50 }, (_, index) =>
        index % 2 === 0
          ? item({ type: 'note', notes: 'lo que sea' })
          : item({ type: 'card', number: '4111111111111111' }),
      )
      const after = auditPasswords([...passwords, ...others])

      expect(after.withPassword).toBe(before.withPassword)
      expect(after.counts).toEqual(before.counts)
      expect(after.flagged).toHaveLength(before.flagged.length)
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

    expect(groups[0].items.map((one) => one.content.name)).toHaveLength(2)
    expect(groups[0].items[0].id).toBeDefined()
  })

  it('leaves out the passwords nobody repeats', () => {
    expect(repeatedGroups([item({ password: 'suya-propia' })])).toHaveLength(0)
  })
})

/*
 * `ADR-018` §4 asked for this by name, and the failure it guards against arrives on its
 * own: the audit groups by password over a Map, so the moment an entry keeps three old
 * ones, an entry could count as «repeated» against ITSELF and the proportion this screen
 * exists to bring down would rise without anybody having reused anything.
 */
describe('the password history', () => {
  it('is not counted by the audit', () => {
    const shared = 'la-misma'
    const audited = auditPasswords([
      item({
        name: 'GitHub',
        password: 'una',
        history: [{ password: shared, date: '2026-01-01T00:00:00.000Z', origin: 'rotation' }],
      }),
      item({
        name: 'Banco',
        password: 'otra',
        history: [{ password: shared, date: '2026-01-01T00:00:00.000Z', origin: 'rotation' }],
      }),
    ])

    expect(audited.counts.repeated).toBe(0)
    expect(audited.flagged.filter((one) => one.findings.includes('repeated'))).toEqual([])
  })

  it('does not make an entry repeat against itself', () => {
    const audited = auditPasswords([
      item({
        name: 'GitHub',
        password: 'la-actual',
        history: [{ password: 'la-actual', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' }],
      }),
    ])

    expect(audited.counts.repeated).toBe(0)
  })
})

/*
 * The fourth thing the audit reports, and the only one that is not about a password.
 * #622 kept it apart from `Finding`, and these tests are what hold it there.
 */
describe('the unresolved conflicts', () => {
  const candidate = {
    password: 'de-otro-gestor',
    date: '2026-02-07T00:00:00.000Z',
    origin: 'import' as const,
  }
  const retired = { password: 'la-vieja', date: '2026-01-03T00:00:00.000Z', origin: 'rotation' as const }

  it('lists the entries with a password from another manager that nobody has confirmed', () => {
    const conflicted = item({ password: CLEAN, history: [candidate] })
    const audit = auditPasswords([conflicted, item({ password: 'Zyxwv98765?abc' })])

    expect(audit.unresolved).toEqual([conflicted])
  })

  /*
   * A retired password is history and nothing more: its owner already decided. Counting
   * it here would mark every entry whose password was ever changed.
   */
  it('does not list an entry whose history holds only retired passwords', () => {
    const audit = auditPasswords([item({ password: CLEAN, history: [retired] })])

    expect(audit.unresolved).toEqual([])
  })

  /*
   * APART FROM THE OTHER THREE, which is the decision: the headline is a proportion over
   * passwords, and an entry that is only undecided has nothing wrong with its password.
   * If this ever joined `counts` or `flagged`, the headline would move without any
   * password having got worse.
   */
  it('stays out of the counts and the proportion the headline reports', () => {
    const audit = auditPasswords([item({ password: CLEAN, history: [candidate] })])

    expect(audit.unresolved).toHaveLength(1)
    expect(audit.flagged).toEqual([])
    expect(audit.counts).toEqual({ repeated: 0, short: 0, weak: 0 })
    expect(audit.withPassword).toBe(1)
  })

  /*
   * The question does not need a current password to exist: candidates can be waiting on
   * an entry whose password was emptied. It is the one case the quality findings cannot
   * see, which is another reason it lives apart from them.
   */
  it('lists an entry with no current password when candidates are waiting', () => {
    const audit = auditPasswords([item({ history: [candidate] })])

    expect(audit.unresolved).toHaveLength(1)
    expect(audit.withPassword).toBe(0)
  })
})
