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

/*
 * Firefox's, and its shape is the whole reason #381 is not «one more header in the map»:
 * THERE IS NO `name` COLUMN. It identifies a credential by its URL, so the name has to
 * be derived or every row is dropped.
 *
 * The surplus columns are the program's bookkeeping — a guid and three timestamps —
 * which is the case `ADR-011` §2.4 did not foresee when it said to keep what does not
 * fit in the notes.
 */
const FIREFOX = `"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"
"https://www.github.com","ada","secreto","","https://github.com","{abc-123}","1712345678901","1712345678901","1712345678901"
"https://banco.es","0001","otra","Zona privada","","{def-456}","1712345678902","1712345678902","1712345678902"`

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

describe('Firefox\'s CSV', () => {
  it('recognises the format even though it has no name column', async () => {
    const parsed = await parseImportFile(FIREFOX)

    expect(parsed.format).toBe('firefox')
    expect(parsed.items).toHaveLength(2)
  })

  /*
   * WITHOUT DERIVING THE NAME THE WHOLE FILE IS DISCARDED, row by row, because `toItem`
   * returns null when there is none. Mapping the columns alone would not have been
   * enough, and the failure would have looked like «Firefox is not supported» rather
   * than a missing line of code.
   */
  it('names the entry after its host, without the www', async () => {
    const parsed = await parseImportFile(FIREFOX)

    expect(parsed.items[0].nombre).toBe('github.com')
    expect(parsed.items[1].nombre).toBe('banco.es')
  })

  it('maps what it does have', async () => {
    const parsed = await parseImportFile(FIREFOX)

    expect(parsed.items[0].usuario).toBe('ada')
    expect(parsed.items[0].password).toBe('secreto')
    expect(parsed.items[0].url).toBe('https://www.github.com')
  })

  /*
   * The exception to `ADR-011` §2.4, and it is reported rather than silent. Keeping a
   * guid and three timestamps would put five lines of machine noise in the notes of
   * every entry — in a field the search reads on purpose.
   */
  it('leaves out the exporting program\'s bookkeeping, and says which columns', async () => {
    const parsed = await parseImportFile(FIREFOX)

    expect(parsed.items[0].notas).toBeUndefined()
    expect(parsed.droppedFields).toContain('guid')
    expect(parsed.droppedFields).toContain('timecreated')
    expect(parsed.droppedFields).toContain('formactionorigin')
  })

  /*
   * `httpRealm` is NOT bookkeeping: it is the only surplus column that says something
   * the URL does not — that this credential is for HTTP authentication and not a form.
   */
  it('keeps the realm, which is the one surplus column that means something', async () => {
    const parsed = await parseImportFile(FIREFOX)

    expect(parsed.items[1].notas).toContain('httprealm: Zona privada')
    expect(parsed.movedFields).toContain('httprealm')
  })

  /*
   * THE SIGNATURE OF FIREFOX IS A SUBSET OF CHROME'S, so which format wins would depend
   * on the order of the keys in HEADERS without the `absent` rule. This is the test that
   * would catch that, and it is the reason the rule exists.
   */
  it('does not take a Chrome file for a Firefox one', async () => {
    expect((await parseImportFile(CHROME)).format).toBe('chrome')
    expect((await parseImportFile(FIREFOX)).format).toBe('firefox')
  })

  /*
   * A URL that does not parse is still a better name than dropping the entry: losing a
   * password because its address was odd is the worst thing this import could do.
   */
  it('falls back to the raw text when the address does not parse', async () => {
    const odd = `url,username,password
    no es una url,ada,secreto`
    const parsed = await parseImportFile(odd)

    expect(parsed.items[0].nombre).toBe('no es una url')
  })

  it('drops only the rows that have nothing to be named after', async () => {
    const empty = `url,username,password
,ada,secreto`
    const parsed = await parseImportFile(empty)

    expect(parsed.items).toHaveLength(0)
    expect(parsed.skipped).toBe(1)
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
