import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  EDITED_FIELDS,
  EMPTY_ITEM,
  itemSchema,
  MAX_CARD_FIELD,
  PRESERVED_FIELDS,
  toContent,
  toFormData,
  type ItemFormData,
} from '@/lib/vault/schema'
import type { ItemContent } from '@/lib/vault/types'

/**
 * A stored login, with every key a login has filled in.
 *
 * It is built by hand and not from the form, because the point of these tests is
 * exactly the fields the form does not have.
 *
 * IT IS NOT «EVERY KEY OF THE BLOB» ANY MORE, which is what this comment used to claim:
 * ADR-020 added the type and the card's five, and a login carries none of them. The
 * fixture that does carry everything is `everyEditedField` below, and the two are kept
 * apart on purpose — several tests here assert what happens to an entry that has NO
 * type, which is what all 370 entries of the real vault are.
 */
const stored: ItemContent = {
  name: 'GitHub',
  username: 'ada@example.com',
  password: 's3cr3t',
  url: 'https://github.com',
  notes: 'la de trabajo',
  tags: ['trabajo', 'código'],
  favourite: true,
  totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
}

/** The form as it opens on that entry, with nothing changed. */
const untouched: ItemFormData = toFormData(stored)

/**
 * An entry carrying every key the editor owns, which is what the emptying loop needs.
 *
 * A fixture that only fills in a login's fields makes that loop pass over the card's
 * without touching them: `toContent` never sees them, so nothing can survive being
 * emptied and the assertion holds for the wrong reason. It is the same shape of failure
 * as a test that passes with the fix and without it.
 */
const everyEditedField: ItemContent = {
  ...stored,
  cardholder: 'Ada Lovelace',
  number: '378282246310005',
  expiry: '05/29',
  csc: '1234',
  pin: '9876',
}

describe('toContent', () => {
  /*
   * THIS IS THE TEST THAT HAS TO FAIL WHEN THE NEXT FIELD IS ADDED AND FORGOTTEN, and
   * it is written over PRESERVED_FIELDS and not over `favourite` on purpose: naming the
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
    const saved = toContent(EMPTY_ITEM, everyEditedField)

    for (const field of EDITED_FIELDS) {
      if (field === 'name') continue

      expect(saved, `«${field}» survived being emptied`).not.toHaveProperty(field)
    }
  })

  it('keeps the name, which is the only field that is always there', () => {
    expect(toContent({ ...EMPTY_ITEM, name: '  GitHub  ' }, stored).name).toBe('GitHub')
  })

  it('writes nothing to preserve when the entry is new', () => {
    expect(toContent({ ...EMPTY_ITEM, name: 'Nueva' })).toEqual({ name: 'Nueva' })
  })

  /*
   * `type` IS CLASSIFIED `preserved` AND NOT `edited`, which is what ADR-020 §4 decided:
   * the type is fixed when the entry is created and never changed, so a save has to
   * carry it across.
   *
   * THIS ASSERTS THE CLASSIFICATION AND NOT A BEHAVIOUR, which is unusual here and is
   * the honest version. The behavioural guard would be the loop over EDITED_FIELDS
   * below run against a card, and it cannot be written yet: the form does not carry
   * these fields until #505 and #506, so `toContent` neither writes nor removes them
   * and every behavioural test would pass with the decision flipped. That is the #360
   * failure — a test that passes with the fix and without it — and the way not to ship
   * one is to say what is actually being pinned.
   */
  it('classifies the type as preserved, so that a save cannot change it', () => {
    expect(PRESERVED_FIELDS).toContain('type')
  })

  /*
   * The round trip of a card, which is the shape that did not exist before ADR-020.
   * Nothing here may be lost, whether the key is one the editor will own later or the
   * type it never will.
   */
  it('keeps a card whole when it is saved', () => {
    const card: ItemContent = {
      name: 'Visa del banco',
      type: 'card',
      cardholder: 'Ada Lovelace',
      number: '378282246310005',
      expiry: '05/29',
      csc: '1234',
      pin: '9876',
    }

    expect(toContent(toFormData(card), card)).toEqual(card)
  })

  it('writes the card the editor typed', () => {
    const saved = toContent(
      { ...EMPTY_ITEM, name: 'Visa', cardholder: 'Ada', number: '  4111  ', csc: '1234' },
      undefined,
      'card',
    )

    expect(saved).toEqual({
      name: 'Visa',
      type: 'card',
      cardholder: 'Ada',
      number: '4111',
      csc: '1234',
    })
  })

  /*
   * ADR-020 §4 AS A TEST, and it is the one guard of this issue that protects against a
   * SILENT failure rather than a visible one. Changing the type would leave the previous
   * type's fields inside the entry — a password living invisibly inside a card — and
   * nothing on any screen would show it.
   */
  it('cannot change the type of an entry that already has one', () => {
    const note: ItemContent = { name: 'Ideas', type: 'note', notes: 'lo de siempre' }

    expect(toContent(toFormData(note), note, 'card').type).toBe('note')
  })

  /*
   * The same guard for the 370 entries that carry no type at all: an edit must not be
   * able to turn one into a card either, or the vault gets rewritten one save at a time.
   */
  it('cannot give a type to an entry saved before there were types', () => {
    expect(toContent(untouched, stored, 'card')).not.toHaveProperty('type')
  })

  it('keeps the star and an unknown key while saving a card', () => {
    const card = { ...everyEditedField, type: 'card', adjuntos: ['recibo.pdf'] } as ItemContent
    const saved = toContent(toFormData(card), card)

    expect(saved.favourite).toBe(true)
    expect(saved).toHaveProperty('adjuntos', ['recibo.pdf'])
    expect(saved.type).toBe('card')
  })

  /*
   * The other half of «absent means a login», and the one that keeps the 370 entries of
   * the real vault out of any migration: saving one of them must not quietly give it a
   * type. A `type: 'login'` written here would be a rewrite of the whole vault carried
   * out one save at a time.
   */
  it('does not give a login a type it never had', () => {
    expect(toContent(untouched, stored)).not.toHaveProperty('type')
  })

  it('omits what was never filled in instead of storing empty strings', () => {
    expect(toContent({ ...EMPTY_ITEM, name: 'Nueva', username: '   ' })).toEqual({
      name: 'Nueva',
    })
  })
})

describe('itemSchema, on the second factor', () => {
  /** The form as it opens on a bare entry, which is what these cases start from. */
  const form = (totp: string) => ({ ...EMPTY_ITEM, name: 'GitHub', totp })

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

describe('itemSchema, on a card', () => {
  /** The form as it opens on a bare card, which is what these cases start from. */
  const card = (fields: Partial<ItemFormData>) => ({
    ...EMPTY_ITEM,
    name: 'Visa del banco',
    ...fields,
  })

  /** What the schema left of a field once it accepted the form. */
  const parsed = (fields: Partial<ItemFormData>) => itemSchema.parse(card(fields))

  /*
   * THE CASE THIS ISSUE EXISTS FOR. Any rule written around the sixteen digits of a Visa
   * refuses an American Express, which has FIFTEEN grouped 4-6-5 — and refusing means
   * telling somebody holding a card in their hand that it is not a card. See ADR-020 §6.
   */
  it('takes fifteen digits and sixteen alike, because a card is not one shape', () => {
    expect(parsed({ number: '378282246310005' }).number).toBe('378282246310005')
    expect(parsed({ number: '4111111111111111' }).number).toBe('4111111111111111')
  })

  /*
   * The failure this must never commit, and the one worth naming: an American Express
   * code is FOUR digits and printed on the front, while every other brand's is three and
   * on the back. A field bounded at three would take the four, keep the first three and
   * say nothing — and the card that no longer works is discovered at the checkout.
   */
  it('keeps a four-digit security code whole, and a three-digit one too', () => {
    expect(parsed({ csc: '1234' }).csc).toBe('1234')
    expect(parsed({ csc: '123' }).csc).toBe('123')
  })

  it('takes a PIN of six digits, because they are not always four', () => {
    expect(parsed({ pin: '987654' }).pin).toBe('987654')
  })

  /*
   * No shape is imposed on any of them, which is the whole rule rather than a leniency
   * about one field: what goes in is read off a piece of plastic and typed by hand.
   */
  it('imposes no shape, on the number or on the date', () => {
    expect(parsed({ number: '3782 822463 10005' }).number).toBe('3782 822463 10005')
    expect(parsed({ expiry: 'mayo de 2029' }).expiry).toBe('mayo de 2029')
  })

  it('trims what a paste brought along, unlike a password', () => {
    expect(parsed({ number: '  4111111111111111  ' }).number).toBe('4111111111111111')
  })

  /*
   * The cap is the half that does exist, and it is not decoration: these fields travel
   * inside the blob, so what the client does not check nobody checks. A bulk import is
   * where that gets tested for real.
   */
  it.each(['number', 'expiry', 'csc', 'pin'] as const)('caps «%s» by length', (field) => {
    expect(itemSchema.safeParse(card({ [field]: 'x'.repeat(MAX_CARD_FIELD) })).success).toBe(true)
    expect(itemSchema.safeParse(card({ [field]: 'x'.repeat(MAX_CARD_FIELD + 1) })).success).toBe(
      false,
    )
  })

  it('gives the cardholder the room a name needs, not the card cap', () => {
    expect(itemSchema.safeParse(card({ cardholder: 'A'.repeat(MAX_CARD_FIELD + 1) })).success).toBe(
      true,
    )
  })
})

describe('toFormData', () => {
  it('turns the absent keys into the empty values the form expects', () => {
    expect(toFormData({ name: 'GitHub' })).toEqual(EMPTY_ITEM_WITH('GitHub'))
  })
})

/** The empty form with a name in it, which is what a bare entry looks like on screen. */
function EMPTY_ITEM_WITH(name: string): ItemFormData {
  return { ...EMPTY_ITEM, name }
}

/*
 * The history of `ADR-018`, written here and nowhere else — its §4 asked for `toContent`
 * to be the only writer, and the reason is that this is the one function that sees the
 * stored content and the new one at the same time, and it is pure.
 */
describe('the password history', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records the previous password when it changes', () => {
    const saved = toContent({ ...untouched, password: 'la-nueva' }, stored)

    expect(saved.password).toBe('la-nueva')
    expect(saved.history).toEqual([
      { password: 's3cr3t', date: '2026-09-10T12:00:00.000Z', origin: 'rotation' },
    ])
  })

  it('records nothing when the password is not touched', () => {
    expect(toContent(untouched, stored).history).toBeUndefined()
  })

  /*
   * CLEARING IT COUNTS AS CHANGING IT, and it is the case this exists to undo: emptying
   * the field by accident would otherwise drop the only copy at the moment it is most
   * needed.
   */
  it('records the previous password when the field is emptied', () => {
    const saved = toContent({ ...untouched, password: '' }, stored)

    expect(saved.password).toBeUndefined()
    expect(saved.history?.[0].password).toBe('s3cr3t')
  })

  /*
   * `ADR-018` §2.3: history is not manufactured where it did not happen. Creating an
   * entry has no previous password, so there is nothing to record.
   */
  it('records nothing when the entry is being created', () => {
    expect(toContent({ ...EMPTY_ITEM, name: 'Nueva', password: 'x' }).history).toBeUndefined()
  })

  it('puts the newest first', () => {
    const withHistory: ItemContent = {
      ...stored,
      history: [{ password: 'la-vieja', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' }],
    }

    const saved = toContent({ ...untouched, password: 'la-nueva' }, withHistory)

    expect(saved.history?.map((one) => one.password)).toEqual(['s3cr3t', 'la-vieja'])
  })

  /*
   * THREE, WRITTEN AS A NUMBER AND NOT AS `MAX_HISTORY`, which `ADR-018` §4 asked for by
   * name: Iteration 13 let nineteen tests through that were built from `SHORT_BELOW` and
   * moved with it. Moving the cap has to break this.
   */
  it('keeps three and drops the oldest', () => {
    const full: ItemContent = {
      ...stored,
      history: [
        { password: 'v3', date: '2026-03-01T00:00:00.000Z', origin: 'rotation' },
        { password: 'v2', date: '2026-02-01T00:00:00.000Z', origin: 'rotation' },
        { password: 'v1', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' },
      ],
    }

    const saved = toContent({ ...untouched, password: 'la-nueva' }, full)

    expect(saved.history).toHaveLength(3)
    expect(saved.history?.map((one) => one.password)).toEqual(['s3cr3t', 'v3', 'v2'])
  })

  /*
   * NO ENTRY WRITTEN BEFORE THIS NEEDS MIGRATING, which is the same contract that made
   * `type` cost nothing in `ADR-020` §4: absent is a valid state and it reads exactly as
   * it always did.
   */
  it('leaves an entry that never had history without the key', () => {
    const before: ItemContent = { name: 'Vieja', password: 'x' }
    const saved = toContent(toFormData(before), before)

    expect('history' in saved).toBe(false)
  })
})
