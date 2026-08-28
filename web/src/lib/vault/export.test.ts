import { describe, expect, it } from 'vitest'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportEncrypted,
  exportPlain,
  type ExportFile,
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
  nombre: 'GitHub-RECONOCIBLE',
  usuario: 'ada-RECONOCIBLE@example.com',
  password: 'contraseña-RECONOCIBLE',
  url: 'https://github-RECONOCIBLE.com',
  notas: 'notas-RECONOCIBLES',
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

    expect(contents).not.toContain('usuario')
    expect(contents).not.toContain('notas')
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
    const withTags: ItemContent = { ...SECRETS, etiquetas: ['Trabajo', 'Banco'], favorito: true }
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

    expect(inside.items[0].etiquetas).toEqual(['Trabajo', 'Banco'])
    expect(inside.items[0].favorito).toBe(true)
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
    expect(exportPlain([]).contents).toBe('name,url,username,password,note,favorite,tags')
  })

  it('does contain the passwords, which is its whole point and its risk', () => {
    const { contents } = exportPlain([item(SECRETS)])

    expect(contents).toContain(SECRETS.password)
    expect(contents).toContain(SECRETS.nombre)
  })

  /*
   * A value with quotes or commas would break the CSV and, worse, could split a field
   * in two and put a password in the wrong column when re-imported.
   */
  it('escapes quotes, commas and newlines', () => {
    const { contents } = exportPlain([
      item({ nombre: 'Con "comillas", comas', password: 'línea 1\nlínea 2' }),
    ])

    expect(contents).toContain('"Con ""comillas"", comas"')
    expect(contents).toContain('"línea 1\nlínea 2"')
  })

  it('leaves the columns of unfilled fields empty', () => {
    const { contents } = exportPlain([item({ nombre: 'Solo el nombre' })])

    expect(contents.split('\n')[1]).toBe('"Solo el nombre","","","","","",""')
  })

  /*
   * WHAT #380 EXISTS FOR, and the failure it closes is not «the export is wrong» but
   * «the export went on being right about a list that had changed».
   *
   * `exportPlain` used to name the five fields by hand, so `favorito` (#377) and
   * `etiquetas` (#378) walked straight past it: the CSV kept coming out perfectly formed
   * and two fields short, and nothing failed because there was nothing that could fail.
   *
   * The real guard is not this test — it is that `PLAIN_EXPORT` is a `Record` over
   * `keyof ItemContent`, so the day the blob gains a field the file stops compiling.
   * Checked by mutation, twice: removing `etiquetas` from the classification, and adding
   * a `totp` to `ItemContent` without touching the export. Both fail to build.
   */
  it('carries the fields the blob gained, and does not drop them quietly', () => {
    const { contents } = exportPlain([
      item({ nombre: 'Banco', favorito: true, etiquetas: ['trabajo', 'dinero'] }),
    ])

    expect(contents.split('\n')[1]).toBe('"Banco","","","","","true","trabajo;dinero"')
  })

  /*
   * Semicolons and not commas, because a comma is the separator of the file itself: a
   * tag with a comma in it would split the row and put a value in the wrong column,
   * which is the same failure the escaping test above guards against.
   */
  it('joins the tags with something that is not the separator of the file', () => {
    const { contents } = exportPlain([item({ nombre: 'a', etiquetas: ['uno', 'dos'] })])

    expect(contents).toContain('"uno;dos"')
  })

  it('counts the unreadable ones too', () => {
    expect(exportPlain([item(SECRETS, '1'), item(UNREADABLE_CONTENT, '2')]).unreadable).toBe(1)
  })
})
