import { describe, expect, it } from 'vitest'
import { addTag, hasTag, removeTag, tagKey, tagsInVault } from '@/lib/vault/tags'
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
