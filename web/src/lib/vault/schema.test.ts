import { describe, it, expect } from 'vitest'
import {
  EDITED_FIELDS,
  EMPTY_ITEM,
  itemSchema,
  PRESERVED_FIELDS,
  toContent,
  toFormData,
  type ItemFormData,
} from '@/lib/vault/schema'
import type { ItemContent } from '@/lib/vault/types'

/**
 * A stored entry carrying every key of the blob, filled in.
 *
 * It is built by hand and not from the form, because the point of these tests is
 * exactly the fields the form does not have.
 */
const stored: ItemContent = {
  nombre: 'GitHub',
  usuario: 'ada@example.com',
  password: 's3cr3t',
  url: 'https://github.com',
  notas: 'la de trabajo',
  etiquetas: ['trabajo', 'código'],
  favorito: true,
  totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
}

/** The form as it opens on that entry, with nothing changed. */
const untouched: ItemFormData = toFormData(stored)

describe('toContent', () => {
  /*
   * THIS IS THE TEST THAT HAS TO FAIL WHEN THE NEXT FIELD IS ADDED AND FORGOTTEN, and
   * it is written over PRESERVED_FIELDS and not over `favorito` on purpose: naming the
   * one field that was lost would guard the bug already fixed instead of the next one.
   * The TOTP seed of #416 is the field this is waiting for.
   */
  it('keeps every field the form does not edit', () => {
    const saved = toContent(untouched, stored)

    for (const field of PRESERVED_FIELDS) {
      expect(saved[field], `«${field}» was lost on saving`).toEqual(stored[field])
    }
  })

  it('keeps a key written by a client that knew more than this one', () => {
    const fromTheFuture = { ...stored, adjuntos: ['recibo.pdf'] } as ItemContent
    const saved = toContent(untouched, fromTheFuture)

    /*
     * The PUT sends the whole content and not a patch, so a key this client drops stops
     * existing for everybody. FOUNDATION.md makes that the rule for anything writing a
     * whole item, and an old client meeting a new field is where it gets tested.
     */
    expect(saved).toHaveProperty('adjuntos', ['recibo.pdf'])
  })

  it('leaves the whole entry untouched when nothing was edited', () => {
    expect(toContent(untouched, stored)).toEqual(stored)
  })

  /*
   * The other half of building on top of what was stored: a field cleared on screen has
   * to disappear from the blob. Without this, preserving would quietly become «nothing
   * can ever be deleted», which is the same failure with the sign flipped.
   */
  it('removes the keys the form owns once they are emptied', () => {
    const saved = toContent(EMPTY_ITEM, stored)

    for (const field of EDITED_FIELDS) {
      if (field === 'nombre') continue

      expect(saved, `«${field}» survived being emptied`).not.toHaveProperty(field)
    }
  })

  it('keeps the name, which is the only field that is always there', () => {
    expect(toContent({ ...EMPTY_ITEM, nombre: '  GitHub  ' }, stored).nombre).toBe('GitHub')
  })

  it('writes nothing to preserve when the entry is new', () => {
    expect(toContent({ ...EMPTY_ITEM, nombre: 'Nueva' })).toEqual({ nombre: 'Nueva' })
  })

  it('omits what was never filled in instead of storing empty strings', () => {
    expect(toContent({ ...EMPTY_ITEM, nombre: 'Nueva', usuario: '   ' })).toEqual({
      nombre: 'Nueva',
    })
  })
})

describe('itemSchema, on the second factor', () => {
  /** The form as it opens on a bare entry, which is what these cases start from. */
  const form = (totp: string) => ({ ...EMPTY_ITEM, nombre: 'GitHub', totp })

  it('accepts a bare base32 key', () => {
    expect(itemSchema.safeParse(form('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).success).toBe(true)
  })

  it('accepts an otpauth:// address', () => {
    const uri = 'otpauth://totp/GitHub:ada@example.com?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub'

    expect(itemSchema.safeParse(form(uri)).success).toBe(true)
  })

  it('accepts an entry with no second factor, which is most of them', () => {
    expect(itemSchema.safeParse(form('')).success).toBe(true)
  })

  /*
   * THE REASON THIS IS VALIDATED AT ALL. A seed that cannot be read produces six
   * plausible digits that no service accepts, and by the time anybody notices the QR
   * code has been thrown away. Refusing on saving is the only moment it can be fixed
   * cheaply.
   */
  it.each([
    ['a character base32 does not have', 'GEZDGNBV0Y3TQOJQ'],
    ['a key cut short in the middle of a byte', 'GEZDGNBVB'],
    ['an algorithm this client cannot honour', 'otpauth://totp/x?secret=GEZDGNBV&algorithm=MD5'],
    ['an address with no key in it', 'otpauth://totp/GitHub?issuer=GitHub'],
    ['a counter-based address, which is not TOTP', 'otpauth://hotp/x?secret=GEZDGNBV&counter=1'],
  ])('refuses %s', (_, seed) => {
    expect(itemSchema.safeParse(form(seed)).success).toBe(false)
  })

  it('says why, and not just that it is wrong', () => {
    const result = itemSchema.safeParse(form('GEZDGNBV0Y3TQOJQ'))

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('0')
  })
})

describe('toFormData', () => {
  it('turns the absent keys into the empty values the form expects', () => {
    expect(toFormData({ nombre: 'GitHub' })).toEqual(EMPTY_ITEM_WITH('GitHub'))
  })
})

/** The empty form with a name in it, which is what a bare entry looks like on screen. */
function EMPTY_ITEM_WITH(nombre: string): ItemFormData {
  return { ...EMPTY_ITEM, nombre }
}
