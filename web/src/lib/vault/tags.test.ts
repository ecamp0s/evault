import { describe, expect, it } from 'vitest'
import {
  addTag,
  filterByTag,
  hasTag,
  removeTag,
  tagCounts,
  tagKey,
  tagsInVault,
} from '@/lib/vault/tags'
import type { Item } from '@/lib/vault/types'

function item(nombre: string, etiquetas?: string[]): Item {
  return {
    id: nombre,
    vaultId: 'v',
    content: etiquetas ? { nombre, etiquetas } : { nombre },
    createdAt: null,
    updatedAt: null,
  }
}

describe('tagKey', () => {
  /*
   * The whole reason tags are worth anything: the same idea spelled twice is one tag,
   * not two. Somebody who typed «trabajo» in March and «Trabajo» in August would
   * otherwise have two groups of one entry each, and nothing would tell them.
   */
  it('reads two spellings of the same word as one tag', () => {
    expect(tagKey('Trabajo')).toBe(tagKey('trabajo'))
    expect(tagKey('Café')).toBe(tagKey('cafe'))
    expect(tagKey('  banco  ')).toBe(tagKey('Banco'))
  })

  it('keeps different words apart', () => {
    expect(tagKey('banco')).not.toBe(tagKey('bancos'))
  })
})

describe('tagsInVault', () => {
  it('collects every tag once, however many entries carry it', () => {
    const tags = tagsInVault([item('a', ['trabajo']), item('b', ['trabajo', 'banco'])])

    expect(tags).toEqual(['banco', 'trabajo'])
  })

  it('does not offer the same tag twice for being written differently', () => {
    expect(tagsInVault([item('a', ['Trabajo']), item('b', ['trabajo'])])).toHaveLength(1)
  })

  /*
   * The first spelling seen wins, which is arbitrary and has to be: with «Trabajo» on
   * one entry and «trabajo» on another there is no right answer, only a stable one.
   */
  it('keeps the first spelling it saw, and keeps it stable', () => {
    expect(tagsInVault([item('a', ['Trabajo']), item('b', ['trabajo'])])).toEqual(['Trabajo'])
  })

  it('says nothing about a vault with no tags', () => {
    expect(tagsInVault([item('a'), item('b')])).toEqual([])
  })
})

describe('addTag', () => {
  it('adds what the user typed, not the normalised form', () => {
    expect(addTag([], '  Café  ')).toEqual(['Café'])
  })

  /*
   * Returning the same array matters beyond tidiness: the form marks itself dirty by
   * identity, so a new array would announce unsaved changes for a keystroke that
   * changed nothing.
   */
  it('returns the very same array when there is nothing to add', () => {
    const tags = ['Trabajo']

    expect(addTag(tags, 'trabajo')).toBe(tags)
    expect(addTag(tags, '   ')).toBe(tags)
  })
})

describe('removeTag', () => {
  it('removes by meaning and not by spelling', () => {
    expect(removeTag(['Trabajo', 'banco'], 'trabajo')).toEqual(['banco'])
  })
})

describe('hasTag', () => {
  it('recognises the tag however it was written', () => {
    expect(hasTag(item('a', ['Trabajo']), 'trabajo')).toBe(true)
    expect(hasTag(item('a', ['Trabajo']), 'banco')).toBe(false)
    expect(hasTag(item('a'), 'trabajo')).toBe(false)
  })
})

describe('tagCounts', () => {
  /*
   * The count is the half that makes the row usable: «trabajo (48)» and «pruebas (1)»
   * are not the same offer, and a list of bare tags does not say which is worth a click.
   */
  it('says how many entries carry each tag', () => {
    const counts = tagCounts([
      item('a', ['trabajo']),
      item('b', ['trabajo', 'banco']),
      item('c', ['banco']),
    ])

    // Both have two, so the tie is settled by name: «banco» before «trabajo».
    expect(counts).toEqual([
      { tag: 'banco', count: 2 },
      { tag: 'trabajo', count: 2 },
    ])
  })

  it('puts the most used first, and settles ties by name', () => {
    const counts = tagCounts([item('a', ['zeta', 'ana']), item('b', ['zeta'])])

    expect(counts.map((one) => one.tag)).toEqual(['zeta', 'ana'])
  })

  it('counts two spellings of one tag as one tag', () => {
    const counts = tagCounts([item('a', ['Trabajo']), item('b', ['trabajo'])])

    expect(counts).toEqual([{ tag: 'Trabajo', count: 2 }])
  })

  /*
   * An entry carrying the same tag twice — which the editor prevents, but an imported or
   * hand-edited blob does not — must count once and not twice.
   */
  it('does not count an entry twice for carrying the same tag written two ways', () => {
    expect(tagCounts([item('a', ['Trabajo', 'trabajo'])])).toEqual([{ tag: 'Trabajo', count: 1 }])
  })

  it('says nothing about a vault with no tags', () => {
    expect(tagCounts([item('a'), item('b')])).toEqual([])
  })
})

describe('filterByTag', () => {
  it('keeps the entries carrying the tag', () => {
    const kept = filterByTag([item('a', ['trabajo']), item('b', ['banco'])], 'trabajo')

    expect(kept.map((one) => one.content.nombre)).toEqual(['a'])
  })

  it('matches however the tag was written', () => {
    expect(filterByTag([item('a', ['Trabajo'])], 'trabajo')).toHaveLength(1)
  })

  /*
   * Returning everything when nothing is chosen is what lets this be chained between
   * sorting and searching without a branch at the call site.
   */
  it('returns everything when no tag is chosen', () => {
    const items = [item('a', ['trabajo']), item('b')]

    expect(filterByTag(items, null)).toBe(items)
  })

  it('keeps the order it was given, so it can be chained', () => {
    const kept = filterByTag(
      [item('z', ['t']), item('a', ['t']), item('m', ['otra'])],
      't',
    )

    expect(kept.map((one) => one.content.nombre)).toEqual(['z', 'a'])
  })
})
