import { describe, expect, it } from 'vitest'
import { ImportError, findDuplicates, parseImportFile } from '@/lib/vault/import'
import { exportEncrypted, exportPlain } from '@/lib/vault/export'
import type { Item, ItemContent } from '@/lib/vault/types'

function item(content: ItemContent, id = '1'): Item {
  return { id, vaultId: 'v', content, createdAt: null, updatedAt: null }
}

const CHROME = `name,url,username,password,note
GitHub,https://github.com,ada,secreto,la del trabajo
Banco,https://banco.es,0001,otra,`

const BITWARDEN = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
Trabajo,1,login,GitHub,unas notas,campo extra,0,https://github.com,ada,secreto,JBSWY3DPEHPK3PXP`

describe('the native format', () => {
  it('reads back what it has just exported', async () => {
    const original: ItemContent = {
      nombre: 'GitHub',
      usuario: 'ada@example.com',
      password: 'secreto',
      url: 'https://github.com',
      notas: 'con eñes: año',
    }

    const { contents } = await exportEncrypted([item(original)], 'la-passphrase')
    const parsed = await parseImportFile(contents, 'la-passphrase')

    expect(parsed.format).toBe('evault')
    expect(parsed.items).toEqual([original])
  })

  it('says so when the passphrase is not the right one', async () => {
    const { contents } = await exportEncrypted([item({ nombre: 'X' })], 'la-buena')

    await expect(parseImportFile(contents, 'la-mala')).rejects.toMatchObject({
      problem: 'passphrase-incorrecta',
    })
  })

  /*
   * The version is checked before decrypting. A file of an unknown version is refused
   * with an explanation, not read «to see whether it happens to work».
   */
  it('refuses a format version it does not know', async () => {
    const { contents } = await exportEncrypted([item({ nombre: 'X' })], 'p')
    const future = JSON.stringify({ ...JSON.parse(contents), version: 99 })

    await expect(parseImportFile(future, 'p')).rejects.toMatchObject({
      problem: 'version-desconocida',
    })
  })

  it('refuses a JSON that is not an eVault export', async () => {
    await expect(parseImportFile('{"cosa":1}')).rejects.toBeInstanceOf(ImportError)
  })
})

describe('the native CSV', () => {
  it('reads what eVault itself exports in the clear', async () => {
    const { contents } = exportPlain([
      item({ nombre: 'GitHub', usuario: 'ada', password: 'secreto', url: 'https://github.com' }),
    ])

    const parsed = await parseImportFile(contents)

    expect(parsed.items).toEqual([
      { nombre: 'GitHub', url: 'https://github.com', usuario: 'ada', password: 'secreto' },
    ])
  })

  /*
   * A field with quotes and commas is where a weak parser splits the row and puts the
   * password in the next column along. Checked by going there and back.
   */
  it('survives quotes, commas and newlines', async () => {
    const complex: ItemContent = {
      nombre: 'Con "comillas", comas',
      password: 'línea 1\nlínea 2',
      notas: 'y "más" cosas, aquí',
    }

    const { contents } = exportPlain([item(complex)])
    const parsed = await parseImportFile(contents)

    expect(parsed.items[0]).toEqual(complex)
  })
})

describe('Chrome\'s CSV', () => {
  it('recognises the format and maps the columns', async () => {
    const parsed = await parseImportFile(CHROME)

    expect(parsed.format).toBe('chrome')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toEqual({
      nombre: 'GitHub',
      url: 'https://github.com',
      usuario: 'ada',
      password: 'secreto',
      notas: 'la del trabajo',
    })
  })

  it('does not invent empty fields', async () => {
    const parsed = await parseImportFile(CHROME)

    expect(parsed.items[1]).not.toHaveProperty('notas')
  })
})

describe('Bitwarden\'s CSV', () => {
  it('recognises the format and maps its own columns', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.format).toBe('bitwarden')
    expect(parsed.items[0].nombre).toBe('GitHub')
    expect(parsed.items[0].usuario).toBe('ada')
    expect(parsed.items[0].password).toBe('secreto')
    expect(parsed.items[0].url).toBe('https://github.com')
  })

  /*
   * WHAT DOES NOT FIT IS NOT LOST. It is the worst way this can fail: the user sees
   * «imported», deletes the source, and months later finds their TOTP was not there.
   * It is kept in the notes, labelled, and how many fields were moved is said out loud.
   */
  it('keeps what does not fit in the notes, and says what it moved', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.items[0].notas).toContain('unas notas')
    expect(parsed.items[0].notas).toContain('login_totp: JBSWY3DPEHPK3PXP')
    expect(parsed.items[0].notas).toContain('folder: Trabajo')
    expect(parsed.movedFields).toContain('login_totp')
    expect(parsed.movedFields).toContain('folder')
  })
})

describe('what it does not understand', () => {
  it('fails explicitly when it does not recognise the headers', async () => {
    await expect(parseImportFile('una,cosa,cualquiera\n1,2,3')).rejects.toMatchObject({
      problem: 'formato-desconocido',
    })
  })

  it('fails on an empty file', async () => {
    await expect(parseImportFile('   ')).rejects.toMatchObject({ problem: 'fichero-vacio' })
  })

  it('drops the rows with no name and counts them', async () => {
    const parsed = await parseImportFile('name,url,username,password\n,https://x.com,ada,secreto\nBueno,,,')

    expect(parsed.items).toHaveLength(1)
    expect(parsed.skipped).toBe(1)
  })

  it('trims whatever goes past the schema caps', async () => {
    const long = 'x'.repeat(900)
    const parsed = await parseImportFile(`name,url,username,password\n${long},,,`)

    expect(parsed.items[0].nombre).toHaveLength(500)
  })
})

/*
 * Duplicates are flagged but not decided: there is no stable identifier across two
 * instances, so «the same item» is a heuristic, and a heuristic that errs towards
 * merging loses data in silence.
 */
describe('spotting duplicates', () => {
  it('flags the ones matching on name and username', () => {
    const existing: ItemContent[] = [{ nombre: 'GitHub', usuario: 'ada' }]
    const incoming: ItemContent[] = [
      { nombre: 'GitHub', usuario: 'ada' },
      { nombre: 'GitHub', usuario: 'otra' },
      { nombre: 'Banco', usuario: 'ada' },
    ]

    expect([...findDuplicates(incoming, existing)]).toEqual([0])
  })

  it('flags nothing when the vault is empty', () => {
    expect(findDuplicates([{ nombre: 'GitHub' }], []).size).toBe(0)
  })
})
