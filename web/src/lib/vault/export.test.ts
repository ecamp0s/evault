import { describe, expect, it } from 'vitest'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportEncrypted,
  exportPlain,
  type ExportFile,
  plainExportWouldWithhold,
} from '@/lib/vault/export'
import { base64ToBytes, decrypt, deriveExportKey } from '@/lib/vault/crypto'
import { UNREADABLE } from '@/lib/vault/payload'
import type { Item, ItemContent } from '@/lib/vault/types'

/*
 * The five strings that are looked for afterwards inside the encrypted file. It is the
 * same method Iteration 3 used to check the server could read nothing: write
 * recognisable values and go looking for them.
 */
const SECRETS = {
  name: 'GitHub-RECONOCIBLE',
  username: 'ada-RECONOCIBLE@example.com',
  password: 'contraseña-RECONOCIBLE',
  url: 'https://github-RECONOCIBLE.com',
  notes: 'notes-RECONOCIBLES',
}

function item(content: ItemContent, id = '1'): Item {
  return { id, vaultId: 'vault-1', content, createdAt: null, updatedAt: null }
}

// The real marker, not a copy: isUnreadable compares by identity on purpose.
const UNREADABLE_CONTENT = UNREADABLE

describe('the encrypted format', () => {
  /*
   * THE ITERATION'S EXIT CRITERION, checked the way #59's was: none of the strings
   * written may appear in the file.
   */
  it('contains none of the strings that were stored', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')

    for (const value of Object.values(SECRETS)) {
      expect(contents).not.toContain(value)
    }
  })

  it('does not contain the names of the blob\'s fields either', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')

    expect(contents).not.toContain('username')
    expect(contents).not.toContain('notes')
  })

  /*
   * Self-describing: whoever opens it three versions from now has to be able to tell
   * how it was encrypted without guessing. Without this, raising the iterations would
   * leave every earlier file unreadable.
   */
  it('carries its own derivation parameters inside', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    expect(file.format).toBe(EXPORT_FORMAT)
    expect(file.version).toBe(EXPORT_VERSION)
    expect(file.kdf.name).toBe('PBKDF2')
    expect(file.kdf.iterations).toBeGreaterThanOrEqual(600_000)
    expect(file.kdf.salt).not.toHaveLength(0)
    expect(file.cipher.iv).not.toHaveLength(0)
  })

  /*
   * What it deliberately does NOT carry. Metadata a stolen file would hand over for
   * free: how many passwords you have and whose copy it is.
   */
  it('reveals neither how many items there are nor whose vault it is', async () => {
    const { contents } = await exportEncrypted(
      [item(SECRETS, '1'), item(SECRETS, '2'), item(SECRETS, '3')],
      'la-passphrase',
    )
    const file = JSON.parse(contents) as Record<string, unknown>

    expect(Object.keys(file).sort()).toEqual(
      ['cipher', 'ciphertext', 'format', 'kdf', 'version'].sort(),
    )
    expect(contents).not.toContain('@')
  })

  it('can be opened again with the passphrase', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )

    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toEqual([SECRETS])
  })

  /*
   * The tags travel without the export knowing they exist, and that is worth a test of
   * its own (#378).
   *
   * `exportEncrypted` serialises `item.content` WHOLE, so any field the blob gains
   * rides along for free. That is a property and not a coincidence, and the day
   * somebody enumerates the fields here to «be explicit», this fails.
   *
   * The plain CSV is the opposite case and does enumerate them, which is #380.
   */
  it('carries a field the blob gained, without being told about it', async () => {
    const withTags: ItemContent = { ...SECRETS, tags: ['Trabajo', 'Banco'], favourite: true }
    const { contents } = await exportEncrypted([item(withTags)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )

    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items[0].tags).toEqual(['Trabajo', 'Banco'])
    expect(inside.items[0].favourite).toBe(true)
  })

  /*
   * THE ROUND TRIP OF A CARD AND OF A NOTE, which the encrypted format takes whole
   * because it takes everything: it is the backup, and a backup that quietly reshapes
   * what it stores is not one. The test above proves the mechanism over a field; this
   * proves it over the shapes ADR-020 introduced, which are what somebody would restore.
   */
  it('brings back a card and a note exactly as they were stored', async () => {
    const card: ItemContent = {
      name: 'Visa del banco',
      type: 'card',
      cardholder: 'Ada Lovelace',
      number: '378282246310005',
      expiry: '05/29',
      csc: '1234',
      pin: '9876',
    }
    const note: ItemContent = { name: 'La caja', type: 'note', notes: 'izquierda 12' }

    const { contents } = await exportEncrypted([item(card), item(note)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )

    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toEqual([card, note])
  })

  it('does not open with a different passphrase', async () => {
    const { contents } = await exportEncrypted([item(SECRETS)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile

    const key = await deriveExportKey(
      'otra-distinta',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )

    await expect(decrypt(key, { data: file.ciphertext, iv: file.cipher.iv })).rejects.toThrow()
  })

  it('uses a different salt on every export', async () => {
    const firstOne = JSON.parse((await exportEncrypted([item(SECRETS)], 'p')).contents) as ExportFile
    const secondOne = JSON.parse((await exportEncrypted([item(SECRETS)], 'p')).contents) as ExportFile

    expect(firstOne.kdf.salt).not.toBe(secondOne.kdf.salt)
  })
})

/*
 * An item that does not decrypt cannot take the copy of the rest down with it: whoever
 * has a broken entry is exactly who most needs the others. But an incomplete file
 * cannot be written without saying so either.
 */
describe('items that cannot be read', () => {
  it('exports the ones that do open and counts the ones that do not', async () => {
    const { contents, unreadable } = await exportEncrypted(
      [item(SECRETS, '1'), item(UNREADABLE_CONTENT, '2'), item(SECRETS, '3')],
      'la-passphrase',
    )

    expect(unreadable).toBe(1)

    const file = JSON.parse(contents) as ExportFile
    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )
    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toHaveLength(2)
  })

  it('does not put the unreadable marker inside the file', async () => {
    const { contents } = await exportEncrypted([item(UNREADABLE_CONTENT)], 'la-passphrase')
    const file = JSON.parse(contents) as ExportFile
    const key = await deriveExportKey(
      'la-passphrase',
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations,
    )
    const inside = JSON.parse(
      await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
    ) as { items: ItemContent[] }

    expect(inside.items).toEqual([])
  })
})

describe('the plaintext format', () => {
  it('writes the headers other managers understand, and what goes beyond them', () => {
    expect(exportPlain([]).contents).toBe(
      'name,url,username,password,note,favorite,tags,type,card_holder,card_number,card_expiry,card_code,card_pin',
    )
  })

  it('does contain the passwords, which is its whole point and its risk', () => {
    const { contents } = exportPlain([item(SECRETS)])

    expect(contents).toContain(SECRETS.password)
    expect(contents).toContain(SECRETS.name)
  })

  /*
   * A value with quotes or commas would break the CSV and, worse, could split a field
   * in two and put a password in the wrong column when re-imported.
   */
  it('escapes quotes, commas and newlines', () => {
    const { contents } = exportPlain([
      item({ name: 'Con "comillas", comas', password: 'línea 1\nlínea 2' }),
    ])

    expect(contents).toContain('"Con ""comillas"", comas"')
    expect(contents).toContain('"línea 1\nlínea 2"')
  })

  it('leaves the columns of unfilled fields empty', () => {
    const { contents } = exportPlain([item({ name: 'Solo el nombre' })])

    expect(contents.split('\n')[1]).toBe(
      '"Solo el nombre","","","","","","","","","","","",""',
    )
  })

  /*
   * WHAT #380 EXISTS FOR, and the failure it closes is not «the export is wrong» but
   * «the export went on being right about a list that had changed».
   *
   * `exportPlain` used to name the five fields by hand, so `favourite` (#377) and
   * `tags` (#378) walked straight past it: the CSV kept coming out perfectly formed
   * and two fields short, and nothing failed because there was nothing that could fail.
   *
   * The real guard is not this test — it is that `PLAIN_EXPORT` is a `Record` over
   * `keyof ItemContent`, so the day the blob gains a field the file stops compiling.
   * Checked by mutation, twice: removing `tags` from the classification, and adding
   * a `totp` to `ItemContent` without touching the export. Both fail to build.
   */
  it('carries the fields the blob gained, and does not drop them quietly', () => {
    const { contents } = exportPlain([
      item({ name: 'Banco', favourite: true, tags: ['trabajo', 'dinero'] }),
    ])

    expect(contents.split('\n')[1]).toBe(
      '"Banco","","","","","true","trabajo;dinero","","","","","",""',
    )
  })

  /*
   * The same guard over the six fields of ADR-020, and it is here rather than left to
   * the header test because a header proves the column exists while this proves the
   * value reaches it. A card whose number came out one column to the left would still
   * produce a perfectly formed CSV.
   */
  it('carries a card, in the columns of a card', () => {
    const { contents } = exportPlain([
      item({
        name: 'Visa del banco',
        type: 'card',
        cardholder: 'Ada Lovelace',
        number: '378282246310005',
        expiry: '05/29',
        csc: '1234',
        pin: '9876',
      }),
    ])

    expect(contents.split('\n')[1]).toBe(
      '"Visa del banco","","","","","","","card","Ada Lovelace","378282246310005","05/29","1234","9876"',
    )
  })

  /*
   * COUNTED, AND NOT COUNTED BY NAMING `totp`. A count written over the seed would let
   * the NEXT withheld field be dropped in silence, which is the failure #380 came to
   * close, one field later — and the history was that next field.
   */
  it('says how many entries carry something the file does not take', () => {
    const seed = 'GEZDGNBVGY3TQOJQ'
    const items = [
      item({ name: 'con', totp: seed }, '1'),
      item({ name: 'otra con', totp: seed }, '2'),
      item({ name: 'sin' }, '3'),
    ]

    expect(exportPlain(items).withheld).toEqual({ totp: 2, history: 0 })
    expect(plainExportWouldWithhold(items)).toEqual({ totp: 2, history: 0 })
  })

  it('says nothing to count when no entry carries one', () => {
    expect(exportPlain([item({ name: 'sin' })]).withheld).toEqual({ totp: 0, history: 0 })
  })

  /*
   * ONE COUNT PER FIELD, AND THAT IS #625. With a single number for everything withheld,
   * an entry with previous passwords and no seed was counted —rightly— and then announced
   * as leaving without a second factor it never had. Each field asks something different
   * of whoever is leaving, so each one is counted, and said, on its own.
   *
   * Still over ENTRIES within each field: that is the number that means something, since
   * it tells them how many accounts to go and look at.
   */
  it('counts each withheld field apart, so one never speaks for the other', () => {
    const old = { password: 'la-vieja', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' as const }
    const items = [
      item({ name: 'las dos', totp: 'GEZDGNBVGY3TQOJQ', history: [old] }, '1'),
      item({ name: 'solo historial', history: [old, old] }, '2'),
    ]

    expect(exportPlain(items).withheld).toEqual({ totp: 1, history: 2 })
  })

  it('counts nothing for the encrypted export, which takes everything', async () => {
    const result = await exportEncrypted(
      [
        item({
          name: 'con',
          totp: 'GEZDGNBVGY3TQOJQ',
          history: [{ password: 'la-vieja', date: '2026-01-01T00:00:00.000Z', origin: 'import' }],
        }),
      ],
      'x',
    )

    expect(result.withheld).toEqual({ totp: 0, history: 0 })
    expect(result.contents).not.toContain('GEZDGNBVGY3TQOJQ')
    expect(result.contents).not.toContain('la-vieja')
  })

  /*
   * ADR-017 §2.3 ASKED FOR THIS TEST BY NAME, and it is written over the whole file
   * rather than over the header row on purpose: what must never happen is the seed being
   * ANYWHERE in a file that ends up in the downloads folder, not merely that a column is
   * missing. A password there can be rotated in five minutes; a seed means reconfiguring
   * the second factor account by account, with its QR code and its backup codes.
   */
  it('never writes the second factor seed, anywhere in the file', () => {
    const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const { contents } = exportPlain([item({ name: 'Banco', password: 'abc', totp: seed })])

    expect(contents).not.toContain(seed)
    expect(contents).not.toContain('totp')
    expect(contents).toContain('Banco')
  })

  /*
   * THE SAME PROMISE FOR THE HISTORY, `ADR-018` §2.3, and over the whole file for the
   * same reason: no other manager has anywhere to put previous passwords, so the likely
   * fate of a column carrying them is a notes field — three old passwords in plain text
   * that nobody remembers are there. Neither the passwords nor the word that says where
   * they came from may be anywhere in it.
   */
  it('never writes a previous password, anywhere in the file', () => {
    const { contents } = exportPlain([
      item({
        name: 'Banco',
        password: 'la-actual',
        history: [
          { password: 'la-de-chrome-VIEJA', date: '2026-09-10T08:00:00.000Z', origin: 'import' },
          { password: 'la-retirada-VIEJA', date: '2026-03-01T12:00:00.000Z', origin: 'rotation' },
        ],
      }),
    ])

    expect(contents).not.toContain('VIEJA')
    expect(contents).not.toContain('history')
    expect(contents).not.toContain('2026-09-10')
    expect(contents).toContain('la-actual')
  })

  /*
   * Semicolons and not commas, because a comma is the separator of the file itself: a
   * tag with a comma in it would split the row and put a value in the wrong column,
   * which is the same failure the escaping test above guards against.
   */
  it('joins the tags with something that is not the separator of the file', () => {
    const { contents } = exportPlain([item({ name: 'a', tags: ['uno', 'dos'] })])

    expect(contents).toContain('"uno;dos"')
  })

  it('counts the unreadable ones too', () => {
    expect(exportPlain([item(SECRETS, '1'), item(UNREADABLE_CONTENT, '2')]).unreadable).toBe(1)
  })
})
