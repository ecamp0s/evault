import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT_ORDER, SORT_LABELS, sortItems, type SortOrder } from '@/lib/vault/sort'
import type { Item } from '@/lib/vault/types'

function item(nombre: string, dates: { created?: string | null; updated?: string | null } = {}): Item {
  return {
    id: nombre,
    vaultId: 'v',
    content: { nombre },
    createdAt: dates.created ?? null,
    updatedAt: dates.updated ?? null,
  }
}

const names = (items: Item[]) => items.map((one) => one.content.nombre)

describe('sortItems', () => {
  it('sorts by name by default, which is what an unread vault needs', () => {
    const sorted = sortItems([item('Zeta'), item('Ana'), item('Medio')], DEFAULT_SORT_ORDER)

    expect(names(sorted)).toEqual(['Ana', 'Medio', 'Zeta'])
  })

  /**
   * The regression this whole issue exists for.
   *
   * Until #376 the list was painted in the order `ListVaultItems` sent it, which is
   * `created_at` — so a vault imported in one go showed up in the order of the file it
   * came from. This fails if that comes back.
   */
  it('does not keep the order the server sent', () => {
    const asServed = [item('Zeta', { created: '2020-01-01' }), item('Ana', { created: '2020-01-02' })]

    expect(names(sortItems(asServed, 'nombre'))).toEqual(['Ana', 'Zeta'])
  })

  /**
   * The ñ goes the other way here than in the search, and both are deliberate.
   *
   * `search.ts` strips its tilde so that «espanol» finds «Español». Sorting cannot: in
   * Spanish the ñ is a letter of its own, between the n and the o, and filing «Ñandú»
   * among the Ns looks broken. This fails if somebody reuses `normalize()` here.
   */
  it('files the ñ between the n and the o, unlike the search', () => {
    const sorted = sortItems([item('Ozono'), item('Ñandú'), item('Nutrición')], 'nombre')

    expect(names(sorted)).toEqual(['Nutrición', 'Ñandú', 'Ozono'])
  })

  it('ignores case, because whoever scans a list does too', () => {
    const sorted = sortItems([item('banco'), item('Ana'), item('Zeta')], 'nombre')

    expect(names(sorted)).toEqual(['Ana', 'banco', 'Zeta'])
  })

  it('reads numbers as numbers, so 2 comes before 10', () => {
    const sorted = sortItems([item('Servidor 10'), item('Servidor 2')], 'nombre')

    expect(names(sorted)).toEqual(['Servidor 2', 'Servidor 10'])
  })

  it('puts the most recently added first', () => {
    const sorted = sortItems(
      [item('vieja', { created: '2020-01-01' }), item('nueva', { created: '2026-01-01' })],
      'recientes',
    )

    expect(names(sorted)).toEqual(['nueva', 'vieja'])
  })

  it('puts the most recently changed first, which is not the same thing', () => {
    const sorted = sortItems(
      [
        item('creada antes, tocada ayer', { created: '2020-01-01', updated: '2026-01-02' }),
        item('creada después, sin tocar', { created: '2026-01-01', updated: '2026-01-01' }),
      ],
      'modificados',
    )

    expect(names(sorted)[0]).toBe('creada antes, tocada ayer')
  })

  it('sends what has no date to the end, because it cannot claim to be recent', () => {
    const sorted = sortItems([item('sin fecha'), item('con fecha', { created: '2020-01-01' })], 'recientes')

    expect(names(sorted)).toEqual(['con fecha', 'sin fecha'])
  })

  /**
   * The array belongs to the query cache and `sort` mutates in place.
   *
   * Sorting it without copying would reorder what React Query holds, behind its back
   * and with no re-render to show for it.
   */
  it('never reorders the array it was given', () => {
    const original = [item('Zeta'), item('Ana')]

    sortItems(original, 'nombre')

    expect(names(original)).toEqual(['Zeta', 'Ana'])
  })

  it('has a label for every order it accepts', () => {
    const orders: SortOrder[] = ['nombre', 'recientes', 'modificados']

    expect(Object.keys(SORT_LABELS).sort()).toEqual([...orders].sort())
  })
})
