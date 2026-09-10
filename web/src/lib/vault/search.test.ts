import { describe, expect, it } from 'vitest'
import { filterItems, normalize } from './search'
import type { ItemContent, Item } from './types'

function item(id: string, content: ItemContent): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

const GITHUB = item('1', {
  name: 'GitHub',
  username: 'ada@example.com',
  url: 'https://github.com',
  notes: 'la del trabajo',
})

const BANK = item('2', {
  name: 'Banco Español',
  username: '0001',
  url: 'https://banco.es',
  password: 'secretísima',
})

const EMAIL = item('3', { name: 'Correo del año', username: 'ada@correo.com' })

const CARD = item('4', {
  name: 'Visa del banco',
  type: 'card',
  cardholder: 'Ada Lovelace',
  number: '378282246310005',
  expiry: '05/29',
  csc: '1234',
  pin: '9876',
})

const NOTE = item('5', {
  name: 'La caja fuerte',
  type: 'note',
  notes: 'izquierda 12, derecha 4',
})

const ALL = [GITHUB, BANK, EMAIL]

/** The vault with one of each kind in it, for the cases ADR-020 brought. */
const ALL_KINDS = [...ALL, CARD, NOTE]

/** The names of what it found, which reads better than the whole objects. */
function names(items: Item[]): string[] {
  return items.map(({ content }) => content.name)
}

describe('normalize', () => {
  it('ignores case', () => {
    expect(normalize('GitHub')).toBe('github')
  })

  it('ignores accents', () => {
    expect(normalize('café')).toBe('cafe')
    expect(normalize('Ítaca')).toBe('itaca')
  })

  /*
   * The Spanish n-with-tilde loses its tilde too, and that is a product decision and
   * not an oversight. In Spanish it is a letter in its own right, so sorting would
   * have to keep it; searching would not, because somebody typing «espanol» on a
   * keyboard without that key expects to find «Español», and not finding it looks like
   * the entry does not exist.
   *
   * The price is «ano» finding «año»: one result too many, dismissed at a glance. In a
   * search, a false positive annoys and a false negative hides.
   */
  it('strips that tilde too, so «espanol» finds «Español»', () => {
    expect(normalize('Español')).toBe('espanol')
    expect(normalize('año')).toBe('ano')
  })
})

describe('filterItems', () => {
  it('with no text it returns everything', () => {
    expect(filterItems(ALL, '')).toHaveLength(3)
    expect(filterItems(ALL, '   ')).toHaveLength(3)
  })

  it('finds by name', () => {
    expect(names(filterItems(ALL, 'github'))).toEqual(['GitHub'])
  })

  it('finds by username', () => {
    expect(names(filterItems(ALL, '0001'))).toEqual(['Banco Español'])
  })

  it('finds by url', () => {
    expect(names(filterItems(ALL, 'banco.es'))).toEqual(['Banco Español'])
  })

  it('finds by notes, which is where one account is told from another', () => {
    expect(names(filterItems(ALL, 'trabajo'))).toEqual(['GitHub'])
  })

  it('makes no distinction of case or accents', () => {
    expect(names(filterItems(ALL, 'ESPANOL'))).toEqual(['Banco Español'])
    expect(names(filterItems(ALL, 'español'))).toEqual(['Banco Español'])
  })

  /*
   * Every word has to appear, in any field. Somebody typing «github ada» is after
   * Ada's GitHub entry, not every entry containing one thing or the other: with a
   * union, a two-word search would return more results than a one-word search, which
   * is the opposite of what anyone expects.
   */
  it('demands every word and not any one of them', () => {
    expect(names(filterItems(ALL, 'github ada'))).toEqual(['GitHub'])
    expect(filterItems(ALL, 'github banco')).toHaveLength(0)
  })

  it('the words may sit in different fields and in any order', () => {
    expect(names(filterItems(ALL, 'ada github'))).toEqual(['GitHub'])
    expect(names(filterItems(ALL, 'trabajo example'))).toEqual(['GitHub'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterItems(ALL, 'no existe nada así')).toEqual([])
  })

  /*
   * The password is not a searchable field, and not by oversight: searching by it
   * would mean typing a secret into a field shown in the clear that also ends up in
   * the browser's form history.
   */
  it('never searches inside the password', () => {
    expect(filterItems(ALL, 'secretísima')).toEqual([])
  })

  /*
   * WHAT A CARD ADDS TO THE SEARCH IS ITS HOLDER AND NOTHING ELSE. It is a person's
   * name, and it is how the household card gets told from the company one.
   */
  it('finds a card by its holder', () => {
    expect(names(filterItems(ALL_KINDS, 'lovelace'))).toEqual(['Visa del banco'])
  })

  /*
   * AND NOT BY THE NUMBER, for the same reason it does not search inside a password:
   * typing it means putting a secret into a field shown in the clear that ends up in the
   * browser's form history. The interface already refuses to paint it in the list.
   */
  it('never searches inside the number, the security code or the PIN', () => {
    expect(filterItems(ALL_KINDS, '378282246310005')).toEqual([])
    expect(filterItems(ALL_KINDS, '1234')).toEqual([])
    expect(filterItems(ALL_KINDS, '9876')).toEqual([])
  })

  /*
   * NOT EVEN THE LAST FOUR DIGITS, which is the case that had to be decided rather than
   * deduced: they are the handy way to pick a card at a payment screen AND exactly what
   * a bank asks for over the phone. Whoever needs the card finds it by the name they
   * gave it.
   */
  it('does not find a card by the last four digits of its number', () => {
    expect(filterItems(ALL_KINDS, '0005')).toEqual([])
  })

  it('does not search the expiry either, which tells nothing apart', () => {
    expect(filterItems(ALL_KINDS, '05/29')).toEqual([])
  })

  /*
   * A note is findable by its body, because that is the only thing a note has. It is the
   * same field a login has had searched since the beginning, doing more work.
   */
  it('finds a note by its body, which is all a note has', () => {
    expect(names(filterItems(ALL_KINDS, 'izquierda'))).toEqual(['La caja fuerte'])
  })

  it('tolerates items with fields missing', () => {
    expect(names(filterItems([EMAIL], 'correo'))).toEqual(['Correo del año'])
  })

  it('keeps the order they arrived in', () => {
    expect(names(filterItems(ALL, 'ada'))).toEqual(['GitHub', 'Correo del año'])
  })
})

/*
 * `ADR-018` §4 asks for this by name, and the risk is not hypothetical: `history` holds
 * passwords, and a field that reaches `searchableText` by accident makes an entry findable
 * by a secret it no longer even uses.
 */
describe('the password history', () => {
  it('is not searched', () => {
    const withHistory = item('1', {
      name: 'GitHub',
      password: 'la-actual',
      history: [{ password: 'la-retirada', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' }],
    })

    expect(filterItems([withHistory], 'la-retirada')).toEqual([])
    expect(filterItems([withHistory], 'GitHub')).toHaveLength(1)
  })
})
