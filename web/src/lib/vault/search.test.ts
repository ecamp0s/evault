import { describe, expect, it } from 'vitest'
import { filterItems, normalize } from './search'
import type { ItemContent, Item } from './types'

function item(id: string, content: ItemContent): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

const GITHUB = item('1', {
  nombre: 'GitHub',
  usuario: 'ada@example.com',
  url: 'https://github.com',
  notas: 'la del trabajo',
})

const BANK = item('2', {
  nombre: 'Banco Español',
  usuario: '0001',
  url: 'https://banco.es',
  password: 'secretísima',
})

const EMAIL = item('3', { nombre: 'Correo del año', usuario: 'ada@correo.com' })

const ALL = [GITHUB, BANK, EMAIL]

/** The names of what it found, which reads better than the whole objects. */
function names(items: Item[]): string[] {
  return items.map(({ content }) => content.nombre)
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

  it('tolerates items with fields missing', () => {
    expect(names(filterItems([EMAIL], 'correo'))).toEqual(['Correo del año'])
  })

  it('keeps the order they arrived in', () => {
    expect(names(filterItems(ALL, 'ada'))).toEqual(['GitHub', 'Correo del año'])
  })
})
