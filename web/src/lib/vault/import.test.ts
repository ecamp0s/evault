import { describe, expect, it } from 'vitest'
import {
  ImportError,
  completeness,
  detectFormat,
  findDuplicates,
  groupDuplicates,
  identityOf,
  survivorOf,
  matchingFormats,
  parseImportFile,
} from '@/lib/vault/import'
import { exportEncrypted, exportPlain } from '@/lib/vault/export'
import { parseTotp, totpCode } from '@/lib/vault/totp'
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
      name: 'GitHub',
      username: 'ada@example.com',
      password: 'secreto',
      url: 'https://github.com',
      notes: 'con eñes: año',
    }

    const { contents } = await exportEncrypted([item(original)], 'la-passphrase')
    const parsed = await parseImportFile(contents, 'la-passphrase')

    expect(parsed.format).toBe('evault')
    expect(parsed.items).toEqual([original])
  })

  it('says so when the passphrase is not the right one', async () => {
    const { contents } = await exportEncrypted([item({ name: 'X' })], 'la-buena')

    await expect(parseImportFile(contents, 'la-mala')).rejects.toMatchObject({
      problem: 'passphrase-incorrecta',
    })
  })

  /*
   * The version is checked before decrypting. A file of an unknown version is refused
   * with an explanation, not read «to see whether it happens to work».
   */
  it('refuses a format version it does not know', async () => {
    const { contents } = await exportEncrypted([item({ name: 'X' })], 'p')
    const future = JSON.stringify({ ...JSON.parse(contents), version: 99 })

    await expect(parseImportFile(future, 'p')).rejects.toMatchObject({
      problem: 'version-desconocida',
    })
  })

  it('refuses a JSON that is not an eVault export', async () => {
    await expect(parseImportFile('{"cosa":1}')).rejects.toBeInstanceOf(ImportError)
  })

  /*
   * THE ROUND TRIP OF A VAULT WITH THE THREE KINDS IN IT, which is what somebody
   * restoring a backup actually has. The native format carries the content through
   * untouched, so the guarantee is that NOTHING gets reshaped on the way back — not the
   * type, not the card's five fields, not a key this client has never heard of.
   */
  it('brings back the three kinds of entry exactly as they went out', async () => {
    const login: ItemContent = { name: 'GitHub', username: 'ada', password: 'secreto' }
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

    const { contents } = await exportEncrypted(
      [item(login, '1'), item(card, '2'), item(note, '3')],
      'la-passphrase',
    )
    const parsed = await parseImportFile(contents, 'la-passphrase')

    expect(parsed.items).toEqual([login, card, note])
  })

  /*
   * AND A FILE FROM BEFORE ADR-020 IS READ EXACTLY AS IT ALWAYS WAS: no type appears out
   * of nowhere. It is the same guarantee as «absent means a login», seen from the import
   * — a backup taken last month must not come back with a key it never had.
   */
  it('does not invent a type for a file written before there were types', async () => {
    const old: ItemContent = { name: 'GitHub', username: 'ada', password: 'secreto' }

    const { contents } = await exportEncrypted([item(old)], 'p')
    const parsed = await parseImportFile(contents, 'p')

    expect(parsed.items[0]).not.toHaveProperty('type')
    expect(parsed.items).toEqual([old])
  })

  /*
   * A key written by a client newer than this one survives the trip, which is the import
   * side of the rule FOUNDATION.md §2 states for anything that writes a whole item.
   */
  it('carries back a key it does not know about', async () => {
    const fromTheFuture = { name: 'X', adjuntos: ['recibo.pdf'] } as ItemContent

    const { contents } = await exportEncrypted([item(fromTheFuture)], 'p')
    const parsed = await parseImportFile(contents, 'p')

    expect(parsed.items[0]).toHaveProperty('adjuntos', ['recibo.pdf'])
  })
})

describe('the native CSV', () => {
  it('reads what eVault itself exports in the clear', async () => {
    const { contents } = exportPlain([
      item({ name: 'GitHub', username: 'ada', password: 'secreto', url: 'https://github.com' }),
    ])

    const parsed = await parseImportFile(contents)

    expect(parsed.items).toEqual([
      { name: 'GitHub', url: 'https://github.com', username: 'ada', password: 'secreto' },
    ])
  })

  /*
   * A field with quotes and commas is where a weak parser splits the row and puts the
   * password in the next column along. Checked by going there and back.
   */
  it('survives quotes, commas and newlines', async () => {
    const complex: ItemContent = {
      name: 'Con "comillas", comas',
      password: 'línea 1\nlínea 2',
      notes: 'y "más" cosas, aquí',
    }

    const { contents } = exportPlain([item(complex)])
    const parsed = await parseImportFile(contents)

    expect(parsed.items[0]).toEqual(complex)
  })
})

/*
 * WHAT A FOREIGN CSV MAY NOT DO IS INVENT A TYPE, and Bitwarden is the case that makes
 * it concrete rather than theoretical: its file HAS a `type` column, whose values are
 * the English words `login`, `note` and `card`. Reading it as ours would be a one-line
 * change that looks like an improvement.
 *
 * It must not happen for two separate reasons. The words are not our values —`tarjeta`
 * and `nota` are— so it would write types that mean nothing; and `type: login` would
 * store a key that ADR-020 §4 says must be ABSENT, turning every imported login into an
 * entry shaped unlike the 370 already in the vault.
 *
 * What happens to that column instead is what happens to any column that does not fit:
 * it goes to the notes and is reported as moved, which is ADR-011 §2.4.
 */
describe('the types a foreign CSV must not invent', () => {
  it('does not read Bitwarden\'s own type column as ours', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.items[0]).not.toHaveProperty('type')
    expect(parsed.movedFields).toContain('type')
  })

  it('imports every row of a foreign file as a login, whatever it says', async () => {
    const withTypes = `name,url,username,password,note,type
Una tarjeta,,,,,card
Una nota,,,,,note`

    const parsed = await parseImportFile(withTypes)

    for (const content of parsed.items) {
      expect(content).not.toHaveProperty('type')
    }
  })

  /*
   * And no card field arrives from a foreign CSV either: FIELD_MAP has no target for
   * them, so a column called `card_number` lands in the notes like any other surplus.
   * Which is also why the caps of the schema have nothing new to apply here — what
   * cannot arrive cannot be too long.
   */
  it('does not fill in a card from columns that look like one', async () => {
    const looksLikeACard = `name,url,username,password,note,card_number,card_code
Visa,,,,,378282246310005,1234`

    const parsed = await parseImportFile(looksLikeACard)

    expect(parsed.items[0]).not.toHaveProperty('number')
    expect(parsed.items[0]).not.toHaveProperty('csc')
    expect(parsed.movedFields).toEqual(expect.arrayContaining(['card_number', 'card_code']))
  })
})

describe('Chrome\'s CSV', () => {
  it('recognises the format and maps the columns', async () => {
    const parsed = await parseImportFile(CHROME)

    expect(parsed.format).toBe('chrome')
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]).toEqual({
      name: 'GitHub',
      url: 'https://github.com',
      username: 'ada',
      password: 'secreto',
      notes: 'la del trabajo',
    })
  })

  it('does not invent empty fields', async () => {
    const parsed = await parseImportFile(CHROME)

    expect(parsed.items[1]).not.toHaveProperty('notes')
  })
})

describe('Bitwarden\'s CSV', () => {
  it('recognises the format and maps its own columns', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.format).toBe('bitwarden')
    expect(parsed.items[0].name).toBe('GitHub')
    expect(parsed.items[0].username).toBe('ada')
    expect(parsed.items[0].password).toBe('secreto')
    expect(parsed.items[0].url).toBe('https://github.com')
  })

  /*
   * WHAT DOES NOT FIT IS NOT LOST. It is the worst way this can fail: the user sees
   * «imported», deletes the source, and months later finds something was not there.
   * It is kept in the notes, labelled, and how many fields were moved is said out loud.
   */
  it('keeps what does not fit in the notes, and says what it moved', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.items[0].notes).toContain('unas notas')
    expect(parsed.items[0].notes).toContain('folder: Trabajo')
    expect(parsed.movedFields).toContain('folder')
  })

  /*
   * THE SEED GOES TO ITS FIELD AND NOT TO THE NOTES, which ADR-017 §4 asked for by name.
   * Until #419 it fell through to `notes`, AND NOTES ARE WHAT THE SEARCH READS — a
   * secret that outlives a password, sitting in an indexed field.
   */
  it('puts the second factor in its own field', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(parsed.items[0].totp).toBe('JBSWY3DPEHPK3PXP')
    expect(parsed.items[0].notes).not.toContain('JBSWY3DPEHPK3PXP')
    expect(parsed.movedFields).not.toContain('login_totp')
  })

  /*
   * ARRIVING IS NOT THE SAME AS WORKING, and #419 asked for this distinction on purpose:
   * a seed can land in the right field and still be unusable, because a TOTP done wrong
   * returns six plausible digits rather than an error. The expected code was computed
   * with an independent implementation —Python's stdlib `hmac`— for the same instant.
   */
  it('imports a seed that actually produces the right code', async () => {
    const parsed = await parseImportFile(BITWARDEN)

    expect(await totpCode(parseTotp(parsed.items[0].totp ?? ''), 59_000)).toBe('996554')
  })

  /*
   * A SEED THAT CANNOT BE READ IS NOT WRITTEN INTO THE FIELD AND IS NOT DROPPED EITHER.
   * In the field it would produce plausible codes nobody accepts; dropped it would be
   * gone in silence, which `ADR-011` §2.4 calls the worst way this can fail. So it goes
   * where everything that does not fit goes, and gets counted.
   */
  it('leaves an unreadable seed in the notes, and says it moved it', async () => {
    const roto = BITWARDEN.replace('JBSWY3DPEHPK3PXP', 'NO-ES-UNA-CLAVE-0')
    const parsed = await parseImportFile(roto)

    expect(parsed.items[0].totp).toBeUndefined()
    expect(parsed.items[0].notes).toContain('login_totp: NO-ES-UNA-CLAVE-0')
    expect(parsed.movedFields).toContain('login_totp')
  })

  it('takes the otpauth:// form too, which is the other thing Bitwarden exports', async () => {
    const uri = 'otpauth://totp/GitHub:ada?secret=JBSWY3DPEHPK3PXP&issuer=GitHub'
    const parsed = await parseImportFile(BITWARDEN.replace('JBSWY3DPEHPK3PXP', uri))

    expect(parsed.items[0].totp).toBe(uri)
    expect(await totpCode(parseTotp(parsed.items[0].totp ?? ''), 59_000)).toBe('996554')
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

    expect(parsed.items[0].name).toBe('github.com')
    expect(parsed.items[1].name).toBe('banco.es')
  })

  it('maps what it does have', async () => {
    const parsed = await parseImportFile(FIREFOX)

    expect(parsed.items[0].username).toBe('ada')
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

    expect(parsed.items[0].notes).toBeUndefined()
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

    expect(parsed.items[1].notes).toContain('httprealm: Zona privada')
    expect(parsed.movedFields).toContain('httprealm')
  })

  /*
   * THE SIGNATURE OF FIREFOX IS A SUBSET OF CHROME'S, so a Chrome file matches both and
   * which one wins used to depend on the order of the keys in HEADERS — the `absent`
   * rule of #381 was what stopped it, and #612 replaced it with specificity and removed
   * the rule. This test is what would catch either mechanism breaking, and it is the one
   * that made removing `absent` safe to do.
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

    expect(parsed.items[0].name).toBe('no es una url')
  })

  it('drops only the rows that have nothing to be named after', async () => {
    const empty = `url,username,password
,ada,secreto`
    const parsed = await parseImportFile(empty)

    expect(parsed.items).toHaveLength(0)
    expect(parsed.skipped).toBe(1)
  })
})

/*
 * The format detector, tested over all the signatures at once.
 *
 * ONE FILE PER TEST IS WHAT LET THIS BUG LIVE, and that is worth stating because it is a
 * lesson about the tests and not about the code: every format had a test, every test
 * passed, and each one only ever asked «is this file read as mine?». No test asked
 * «could this file be read as somebody else's too?», which is the only question that
 * finds a collision.
 */
describe('which format a file is read as', () => {
  it('reads every known format as its own', async () => {
    const files: [string, string][] = [
      ['chrome', CHROME],
      ['bitwarden', BITWARDEN],
      ['firefox', FIREFOX],
    ]

    for (const [expected, contents] of files) {
      expect((await parseImportFile(contents)).format).toBe(expected)
    }
  })

  /*
   * The collision itself, with both candidates in front instead of asserted through a
   * parsed file: Chrome's headers DO match Firefox, and what decides is that Chrome asks
   * for more columns.
   */
  it('picks the most specific of the formats a header matches', () => {
    const chrome = ['name', 'url', 'username', 'password', 'note']

    expect(matchingFormats(chrome)).toContain('firefox')
    expect(matchingFormats(chrome)[0]).toBe('chrome')
  })

  /*
   * A TIE IS REFUSED, NOT RESOLVED, and it is tested with invented signatures because no
   * real pair produces one: any header matching both Bitwarden and Firefox —the only two
   * that ask for the same number of columns— also matches Chrome, which asks for four
   * and wins. That is an accident of the formats we happen to support, so proving the
   * rule with them would prove nothing about the rule.
   */
  it('refuses a header that two formats match equally well', () => {
    const invented = {
      uno: { required: ['a', 'b'] },
      otro: { required: ['c', 'd'] },
    }
    const header = ['a', 'b', 'c', 'd']

    expect(matchingFormats(header, invented)).toEqual(expect.arrayContaining(['uno', 'otro']))
    expect(() => detectFormat(header, invented)).toThrow(ImportError)
    expect(() => detectFormat(header, invented)).toThrowError(
      expect.objectContaining({ problem: 'formato-ambiguo' }),
    )
  })

  /*
   * And the other half of the same rule: one more required column is enough to decide,
   * so a format that asks for everything another does plus one wins without a tie-break.
   */
  it('lets one extra column decide between two formats', () => {
    const invented = {
      pobre: { required: ['a', 'b'] },
      rico: { required: ['a', 'b', 'c'] },
    }

    expect(detectFormat(['a', 'b', 'c'], invented)).toBe('rico')
    expect(detectFormat(['a', 'b'], invented)).toBe('pobre')
  })

  /*
   * What today keeps the tie unreachable, written down so that adding a format has to
   * face it: Chrome covers the overlap between the only two signatures of equal size.
   * When this stops holding, the file gets refused rather than misread — which is the
   * reason the guard above exists even while nothing can trigger it.
   */
  it('reads a header carrying both Bitwarden and Firefox columns as Chrome', () => {
    const both = ['name', 'login_username', 'login_password', 'url', 'username', 'password']

    expect(matchingFormats(both)).toEqual(['chrome', 'bitwarden', 'firefox'])
    expect(detectFormat(both)).toBe('chrome')
  })

  /*
   * Specificity orders the candidates; it does not relax the refusal. A file that matches
   * nothing is still refused rather than read as the least demanding format, which is the
   * property that keeps passwords from landing in the column called `name`.
   */
  it('still refuses a header that matches nothing', async () => {
    await expect(parseImportFile('una,cosa,cualquiera\n1,2,3')).rejects.toMatchObject({
      problem: 'formato-desconocido',
    })
    expect(matchingFormats(['una', 'cosa', 'cualquiera'])).toEqual([])
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

  /*
   * A row with a name column left empty is dropped, and #401 asked whether it should be
   * named after its host instead — the way a Firefox row is, since it has no name column
   * at all.
   *
   * IT SHOULD NOT, AND THE REASON IS MEASURED: over a real Chrome export of 618
   * credentials, not one row has an empty name. The case this would rescue does not
   * occur, so deriving here would mean inventing a name the user never typed for a row
   * that never arrives — while the count of what was dropped is already reported.
   */
  it('drops the rows with no name and counts them', async () => {
    const parsed = await parseImportFile('name,url,username,password\n,https://x.com,ada,secreto\nBueno,,,')

    expect(parsed.items).toHaveLength(1)
    expect(parsed.skipped).toBe(1)
  })

  it('trims whatever goes past the schema caps', async () => {
    const long = 'x'.repeat(900)
    const parsed = await parseImportFile(`name,url,username,password\n${long},,,`)

    expect(parsed.items[0].name).toHaveLength(500)
  })
})

/*
 * Duplicates are flagged but not decided: there is no stable identifier across two
 * instances, so «the same item» is a heuristic, and a heuristic that errs towards
 * merging loses data in silence.
 */
describe('spotting duplicates', () => {
  it('flags the ones matching on name and username', () => {
    const existing: ItemContent[] = [{ name: 'GitHub', username: 'ada' }]
    const incoming: ItemContent[] = [
      { name: 'GitHub', username: 'ada' },
      { name: 'GitHub', username: 'otra' },
      { name: 'Banco', username: 'ada' },
    ]

    expect([...findDuplicates(incoming, existing)]).toEqual([0])
  })

  it('flags nothing when the vault is empty and the file repeats nothing', () => {
    expect(findDuplicates([{ name: 'GitHub' }], []).size).toBe(0)
  })

  /*
   * AGAINST THE FILE ITSELF AND NOT ONLY AGAINST THE VAULT, which is #442. `ADR-011`
   * §2.4 asks for the ones that LOOK REPEATED to be flagged, and two identical rows in
   * one file look it as much as one colliding with something stored. Before this they
   * both went in, and afterwards nothing said which password was current.
   */
  it('flags a row repeated inside the same file', () => {
    const incoming: ItemContent[] = [
      { name: 'correo.com', username: 'ada', password: 'la-vieja' },
      { name: 'correo.com', username: 'ada', password: 'la-nueva' },
    ]

    expect([...findDuplicates(incoming, [])]).toEqual([1])
  })

  /*
   * THE FIRST SURVIVES AND THE REST ARE FLAGGED, decided rather than fallen into:
   * flagging all of them would leave somebody unticking every copy to keep one.
   */
  it('leaves the first of a run and flags the rest', () => {
    const incoming: ItemContent[] = [
      { name: 'correo.com', username: 'ada' },
      { name: 'correo.com', username: 'ada' },
      { name: 'correo.com', username: 'ada' },
    ]

    expect([...findDuplicates(incoming, [])]).toEqual([1, 2])
  })

  /*
   * The case Firefox makes likely and the reason this was worth fixing: with no name
   * column the name is derived from the host, so everything for one service collapses
   * onto the same one and only the user tells them apart. Different users are NOT
   * duplicates, however identical their names look.
   */
  it('does not flag several accounts on the same service', () => {
    const incoming: ItemContent[] = [
      { name: 'github.com', username: 'ada' },
      { name: 'github.com', username: 'bob' },
      { name: 'github.com', username: 'carol' },
    ]

    expect(findDuplicates(incoming, []).size).toBe(0)
  })

  /*
   * END TO END OVER A FIREFOX FILE, because the shape of the risk is Firefox's: it has
   * NO name column, so `nameFromUrl` derives one from the host and two credentials for
   * the same host and user collapse onto the same name. Firefox does keep them apart —
   * one has an httpRealm, the other a form origin — and neither of those columns
   * survives the import.
   *
   * IT FLAGS THE FIRST AND NOT THE SECOND SINCE #616, and this file is a good example of
   * why the rule changed: the second row carries the realm, which the import keeps in
   * the notes, so it says strictly more than the first. Until #616 the first survived
   * because there was no reason to prefer either; now there is one, and it points here.
   */
  it('flags the repeat in a Firefox file, where the names are derived', async () => {
    const csv = [
      '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"',
      '"https://correo.com","ada","la-vieja","","https://correo.com","{a}","1","1","1"',
      '"https://correo.com","ada","la-nueva","Zona privada","","{b}","1","1","1"',
      '"https://otro.com","ada","suya","","https://otro.com","{c}","1","1","1"',
    ].join('\n')

    const parsed = await parseImportFile(csv)

    expect(parsed.items.map((one) => one.name)).toEqual(['correo.com', 'correo.com', 'otro.com'])
    expect([...findDuplicates(parsed.items, [])]).toEqual([0])
  })

  it('flags the repeat in our own plaintext CSV too', async () => {
    const csv = [
      'name,url,username,password,note,favorite,tags',
      '"Correo","https://correo.com","ada","la-vieja","","",""',
      '"Correo","https://correo.com","ada","la-nueva","","",""',
    ].join('\n')

    const parsed = await parseImportFile(csv)

    expect([...findDuplicates(parsed.items, [])]).toEqual([1])
  })

  it('counts a row that collides with the vault and with the file only once', () => {
    const existing: ItemContent[] = [{ name: 'GitHub', username: 'ada' }]
    const incoming: ItemContent[] = [
      { name: 'GitHub', username: 'ada' },
      { name: 'GitHub', username: 'ada' },
    ]

    expect([...findDuplicates(incoming, existing)]).toEqual([0, 1])
  })
})

/*
 * The identity of an entry, which is what `ADR-022` §2.1 decides and what makes the
 * whole iteration possible: without it there is nothing to group two managers by.
 */
describe('what makes two entries the same account', () => {
  /*
   * THE TEST THAT USED TO RETURN AN EMPTY SET, and the reason #615 exists. The same
   * account exported by Chrome and by Firefox: Chrome carries the name its owner typed
   * and a URL with a path, Firefox has no name column so `nameFromUrl` derives one from
   * the host. Comparing by name sees two different accounts; comparing by host sees one.
   */
  it('matches one account across two managers that name it differently', () => {
    const fromChrome: ItemContent = {
      name: 'GitHub',
      url: 'https://github.com/login?return_to=%2F',
      username: 'ada@example.com',
      password: 'una',
    }
    const fromFirefox: ItemContent = {
      name: 'github.com',
      url: 'https://www.github.com',
      username: 'ada@example.com',
      password: 'otra',
    }

    expect(identityOf(fromChrome)).toBe(identityOf(fromFirefox))
    expect([...findDuplicates([fromFirefox], [fromChrome])]).toEqual([0])
  })

  /*
   * The measurement that rejected the registrable domain, as a test. These three are
   * development, staging and production of one site, with credentials that are different
   * ON PURPOSE — and they are real: they are the biggest groups in the export measured in
   * #610, with nine, six and seven entries.
   */
  it('keeps the environments of one site apart', () => {
    const hosts = [
      'https://dev.elcomercio.multidiario.com',
      'https://pre.elcomercio.multidiario.com',
      'https://elcomercio.multidiario.com',
    ]
    const incoming = hosts.map((url) => ({ name: 'El Comercio', url, username: 'ada' }))

    expect(new Set(incoming.map(identityOf)).size).toBe(3)
    expect(groupDuplicates(incoming, [])).toEqual([])
  })

  it('ignores the case of both the host and the user', () => {
    const one: ItemContent = { name: 'X', url: 'https://GitHub.com', username: 'ADA@example.com' }
    const other: ItemContent = { name: 'X', url: 'https://github.com', username: 'ada@example.com' }

    expect(identityOf(one)).toBe(identityOf(other))
  })

  /*
   * Two accounts on one service are not a duplicate, and this is the frequent case: the
   * big groups in the real export are several accounts on the same host.
   */
  it('does not match two users on the same host', () => {
    const ada: ItemContent = { name: 'X', url: 'https://github.com', username: 'ada' }
    const bob: ItemContent = { name: 'X', url: 'https://github.com', username: 'bob' }

    expect(identityOf(ada)).not.toBe(identityOf(bob))
  })

  /*
   * `ADR-022` §2.4: with the user missing on both sides they are grouped anyway and
   * separated by hand. Measured in #610, it is four groups and eight entries over the
   * whole real export — small enough that separating what got joined costs four
   * decisions, while never grouping them means not seeing real duplicates, for ever and
   * in silence. The asymmetry is what decides, not the number.
   */
  it('groups two entries on one host when neither carries a user', () => {
    const incoming: ItemContent[] = [
      { name: 'Algo', url: 'https://softnyx.com', password: 'una' },
      { name: 'Algo', url: 'https://softnyx.com', password: 'otra' },
    ]

    expect(groupDuplicates(incoming, [])).toHaveLength(1)
  })

  /*
   * An entry with no address falls back to its own name, which is what keeps #442
   * working for notes and cards — and what stops everything without a host from landing
   * in one group.
   */
  it('falls back to the name when there is no address, without joining unrelated ones', () => {
    const wifi: ItemContent = { name: 'Wifi de casa', notes: 'la clave' }
    const otherWifi: ItemContent = { name: 'Wifi de casa', notes: 'la misma' }
    const unrelated: ItemContent = { name: 'Alarma', notes: 'otra cosa' }

    expect(identityOf(wifi)).toBe(identityOf(otherWifi))
    expect(identityOf(unrelated)).not.toBe(identityOf(wifi))
    expect(groupDuplicates([wifi, otherWifi, unrelated], [])).toHaveLength(1)
  })

  /*
   * WHAT THE NEW IDENTITY GIVES UP, fixed as a test so that it stays a decision.
   *
   * An entry saved by hand with no address does not match one imported with it, even for
   * the same service: the first identifies itself by its name and the second by its host.
   * The old criterion caught this one and the new one does not.
   *
   * It is accepted rather than patched, and the alternative says why: matching by name OR
   * by host would let one entry belong to two groups, and then two accounts on different
   * hosts that happen to share a name get chained into one — which is the failure
   * `ADR-011` §2.4 calls losing data in silence. The error stays on the safe side: what
   * was not grouped can be merged by hand, what was wrongly merged has to be found first.
   *
   * In this vault it is close to theoretical: Chrome exports a URL on all 618 rows, and
   * the eight NordPass rows without one are its cards and notes (#610).
   */
  it('does not match an entry saved without an address against one that has it', () => {
    const byHand: ItemContent = { name: 'GitHub', username: 'ada' }
    const imported: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }

    expect(identityOf(byHand)).not.toBe(identityOf(imported))
    expect(groupDuplicates([imported], [byHand])).toEqual([])
  })

  it('gives no identity to an entry with neither address nor name', () => {
    expect(identityOf({ name: '   ' })).toBeNull()
    expect(groupDuplicates([{ name: '' }, { name: '' }], [])).toEqual([])
  })
})

describe('grouping what looks repeated', () => {
  /*
   * What a set of indexes could not say: WHO each one is repeated with. It is what the
   * screen of #619 needs to show a difference and let somebody choose, and the reason
   * #615 changes the shape of the answer and not only the identity behind it.
   */
  it('says who each repeated entry is repeated with', () => {
    const stored: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }
    const incoming: ItemContent[] = [
      { name: 'github.com', url: 'https://github.com', username: 'ada' },
      { name: 'Banco', url: 'https://banco.es', username: 'ada' },
      { name: 'GitHub', url: 'https://github.com/login', username: 'ada' },
    ]

    const groups = groupDuplicates(incoming, [stored])

    expect(groups).toHaveLength(1)
    expect(groups[0].incoming).toEqual([0, 2])
    expect(groups[0].existing).toEqual([stored])
  })

  it('leaves out the entries that collide with nothing', () => {
    const incoming: ItemContent[] = [
      { name: 'A', url: 'https://a.es', username: 'ada' },
      { name: 'B', url: 'https://b.es', username: 'ada' },
    ]

    expect(groupDuplicates(incoming, [])).toEqual([])
  })

  /*
   * A group formed only by stored entries is not returned: whatever is already in the
   * vault is not a decision this import has to raise. Two entries that were duplicated
   * before are the subject of a different screen, not of the file somebody is bringing.
   */
  it('says nothing about entries that were already duplicated in the vault', () => {
    const stored: ItemContent[] = [
      { name: 'GitHub', url: 'https://github.com', username: 'ada' },
      { name: 'GitHub otra vez', url: 'https://github.com', username: 'ada' },
    ]

    expect(groupDuplicates([{ name: 'Banco', url: 'https://banco.es' }], stored)).toEqual([])
  })

  /*
   * When the group already holds something stored, EVERY incoming row is flagged: the
   * survivor is what the vault already has, not the first row of the file.
   */
  it('flags every incoming row when the vault already has that account', () => {
    const stored: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }
    const incoming: ItemContent[] = [
      { name: 'GitHub', url: 'https://github.com', username: 'ada' },
      { name: 'GitHub', url: 'https://github.com/login', username: 'ada' },
    ]

    expect([...findDuplicates(incoming, [stored])]).toEqual([0, 1])
  })
})

describe('which of a group is proposed to be kept', () => {
  /*
   * WHAT IS ALREADY STORED WINS, WHATEVER IT SAYS, and the reason is not its content: it
   * has an id, its dates and anything edited by hand after importing it. Proposing the
   * incoming row would mean creating a second entry and leaving the first — the very
   * duplicate this iteration exists to remove.
   */
  it('keeps what the vault already has, even when the file brings more', () => {
    const stored: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }
    const richer: ItemContent = {
      name: 'GitHub',
      url: 'https://github.com',
      username: 'ada',
      password: 'x',
      notes: 'unas notas',
      totp: 'JBSWY3DPEHPK3PXP',
    }

    expect(completeness(richer)).toBeGreaterThan(completeness(stored))
    expect(groupDuplicates([richer], [stored])[0].survivor).toEqual({ from: 'vault', item: stored })
  })

  it('keeps the most complete of the stored ones when the vault has more than one', () => {
    const poor: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }
    const rich: ItemContent = { ...poor, password: 'x', notes: 'algo' }
    const incoming: ItemContent = { ...poor, password: 'y' }

    expect(groupDuplicates([incoming], [poor, rich])[0].survivor).toEqual({
      from: 'vault',
      item: rich,
    })
  })

  /*
   * Among incoming rows, the one that says most: keeping it loses less than keeping the
   * other, which is the only thing that can be said here without inventing a reason.
   */
  it('proposes the most complete row of the file', () => {
    const incoming: ItemContent[] = [
      { name: 'GitHub', url: 'https://github.com', username: 'ada', password: 'una' },
      {
        name: 'GitHub',
        url: 'https://github.com',
        username: 'ada',
        password: 'otra',
        totp: 'JBSWY3DPEHPK3PXP',
        notes: 'la del trabajo',
      },
    ]

    expect(groupDuplicates(incoming, [])[0].survivor).toEqual({ from: 'file', index: 1 })
  })

  /*
   * DETERMINISTIC ON A TIE, and it is the file's order and not whatever a Map hands back:
   * two identical rows have to propose the same survivor on every run, or the same import
   * done twice writes different entries.
   */
  it('falls back to the first row when two say exactly as much', () => {
    const one: ItemContent = { name: 'X', url: 'https://x.es', username: 'ada', password: 'una' }
    const other: ItemContent = { ...one, password: 'otra' }

    expect(groupDuplicates([one, other], [])[0].survivor).toEqual({ from: 'file', index: 0 })
    expect(groupDuplicates([other, one], [])[0].survivor).toEqual({ from: 'file', index: 0 })
  })

  /*
   * The count ignores what says nothing, which is the same contract `FOUNDATION.md` §2
   * gives `favourite` and `tags`: a key carrying an empty value does not make an entry
   * more complete, and letting it would make the rule prefer whichever manager writes
   * more empty columns.
   */
  it('does not count fields that carry nothing', () => {
    expect(completeness({ name: 'X' })).toBe(1)
    expect(completeness({ name: 'X', username: '', notes: '   ', tags: [] })).toBe(1)
    expect(completeness({ name: 'X', favourite: true, tags: ['a'] })).toBe(3)
  })

  /*
   * NOTHING IS WRITTEN FROM THIS. The survivor is a proposal that the screen of #619
   * shows and anybody can change; what this test fixes is that asking for it does not
   * alter the entries it is asked about.
   */
  it('proposes without touching anything', () => {
    const stored: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }
    const incoming: ItemContent[] = [{ name: 'GitHub', url: 'https://github.com', username: 'ada' }]
    const before = JSON.stringify({ stored, incoming })

    survivorOf({ incoming: [0], existing: [stored] }, incoming)
    groupDuplicates(incoming, [stored])

    expect(JSON.stringify({ stored, incoming })).toBe(before)
  })
})
