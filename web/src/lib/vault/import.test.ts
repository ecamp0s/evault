import { describe, expect, it } from 'vitest'
import {
  ImportError,
  completeness,
  detectFormat,
  findDuplicates,
  groupDuplicates,
  identityOf,
  mergeItems,
  survivorOf,
  matchingFormats,
  parseImportFile,
  planImport,
  summarise,
} from '@/lib/vault/import'
import { exportEncrypted, exportPlain } from '@/lib/vault/export'
import { parseTotp, totpCode } from '@/lib/vault/totp'
import type { GroupDecision } from '@/lib/vault/import'
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

/*
 * NordPass's CSV, with THE HEADER MEASURED FROM THE REAL EXPORT in #610 and not a
 * reconstruction — twenty-four columns, of which three come empty in all 377 rows.
 *
 * Its first four are exactly Chrome's, which is why it used to be read as Chrome: its
 * cards came back as logins with the number in the notes, and the notes are what the
 * search reads (#610).
 */
const NORDPASS_HEADER =
  'name,url,additional_urls,username,password,note,cardholdername,cardnumber,cvc,pin,' +
  'expirydate,zipcode,folder,shared_folder,full_name,phone_number,email,address1,address2,' +
  'city,country,state,type,custom_fields'

const nordpassRow = (values: Record<string, string>) =>
  NORDPASS_HEADER.split(',')
    .map((column) => values[column] ?? '')
    .join(',')

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
      [
        'nordpass',
        [
          NORDPASS_HEADER,
          nordpassRow({ name: 'X', url: 'https://x.es', username: 'ada', password: 'x', type: 'password' }),
        ].join('\n'),
      ],
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
    expect(groups[0].existing).toEqual([0])
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
    expect(groupDuplicates([richer], [stored])[0].survivor).toEqual({ from: 'vault', index: 0 })
  })

  it('keeps the most complete of the stored ones when the vault has more than one', () => {
    const poor: ItemContent = { name: 'GitHub', url: 'https://github.com', username: 'ada' }
    const rich: ItemContent = { ...poor, password: 'x', notes: 'algo' }
    const incoming: ItemContent = { ...poor, password: 'y' }

    expect(groupDuplicates([incoming], [poor, rich])[0].survivor).toEqual({
      from: 'vault',
      index: 1,
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

    survivorOf({ incoming: [0], existing: [0] }, incoming, [stored])
    groupDuplicates(incoming, [stored])

    expect(JSON.stringify({ stored, incoming })).toBe(before)
  })
})

describe('merging two entries into one', () => {
  const github = (extra: Partial<ItemContent> = {}): ItemContent => ({
    name: 'GitHub',
    url: 'https://github.com',
    username: 'ada',
    ...extra,
  })

  it('fills in what the survivor does not have', () => {
    const { item } = mergeItems(
      { content: github({ password: 'una' }) },
      [{ content: github({ password: 'una', totp: 'JBSWY3DPEHPK3PXP', notes: 'la del trabajo' }) }],
    )

    expect(item.totp).toBe('JBSWY3DPEHPK3PXP')
    expect(item.notes).toBe('la del trabajo')
    expect(item.password).toBe('una')
  })

  it('unions the tags without repeating them', () => {
    const { item } = mergeItems({ content: github({ tags: ['trabajo', 'dev'] }) }, [
      { content: github({ tags: ['dev', 'personal'] }) },
    ])

    expect(item.tags?.sort()).toEqual(['dev', 'personal', 'trabajo'])
  })

  it('makes the merge a favourite when any of them was', () => {
    const { item } = mergeItems({ content: github() }, [{ content: github({ favourite: true }) }])

    expect(item.favourite).toBe(true)
  })

  /*
   * Notes are prose somebody wrote: picking one is losing the other, and the field is
   * large enough that keeping both costs nothing worth counting.
   */
  it('keeps both notes, saying where each came from', () => {
    const { item } = mergeItems({ content: github({ notes: 'la del trabajo' }), source: 'Chrome' }, [
      { content: github({ notes: 'la personal' }), source: 'NordPass' },
    ])

    expect(item.notes).toContain('la del trabajo')
    expect(item.notes).toContain('la personal')
    expect(item.notes).toContain('[Chrome]')
    expect(item.notes).toContain('[NordPass]')
  })

  it('does not repeat a note both entries carry', () => {
    const { item } = mergeItems({ content: github({ notes: 'la misma' }) }, [
      { content: github({ notes: 'la misma' }) },
    ])

    expect(item.notes).toBe('la misma')
  })

  /*
   * THE PASSWORD IS NEVER MERGED: concatenating two produces one that opens nothing. The
   * survivor's wins and the other is DISPLACED rather than dropped — #618 gives it a
   * home in the history of `ADR-018`, and until then losing it here would be the failure
   * `ADR-011` §2.4 calls the worst way an import can fail.
   */
  it('keeps the survivor password and sends the other to the history', () => {
    const { item, displaced } = mergeItems({ content: github({ password: 'la-buena' }) }, [
      { content: github({ password: 'la-otra' }), source: 'NordPass' },
    ])

    expect(item.password).toBe('la-buena')
    expect(item.history).toHaveLength(1)
    expect(item.history?.[0].password).toBe('la-otra')
    expect(displaced).toEqual([])
  })

  /*
   * `import` AND NOT `rotation`, which is where the honesty of the field lives: nobody
   * retired this password. Two managers disagreed and which one is current is unknown.
   */
  it('marks a password from a reconciliation as coming from an import', () => {
    const { item } = mergeItems({ content: github({ password: 'una' }) }, [
      { content: github({ password: 'otra' }) },
    ])

    expect(item.history?.[0].origin).toBe('import')
  })

  it('writes no history when both carry the same password', () => {
    const { item } = mergeItems({ content: github({ password: 'igual' }) }, [
      { content: github({ password: 'igual' }) },
    ])

    expect(item.history).toBeUndefined()
  })

  /*
   * `ADR-022` §2.7: the cap is respected and what is dropped is what was already
   * CONFIRMED, keeping the undecided — a password retired long ago is worth less than one
   * that may still be the good one. Three is written as a number and not as MAX_HISTORY,
   * which `ADR-018` §4 asked for by name: moving the cap has to break this.
   */
  it('respects the cap and keeps the undecided ones over the retired ones', () => {
    const old: ItemContent = github({
      password: 'la-actual',
      history: [
        { password: 'vieja-1', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' },
        { password: 'vieja-2', date: '2026-01-02T00:00:00.000Z', origin: 'rotation' },
        { password: 'vieja-3', date: '2026-01-03T00:00:00.000Z', origin: 'rotation' },
      ],
    })

    const { item } = mergeItems({ content: old }, [
      { content: github({ password: 'de-otro-gestor' }) },
    ])

    expect(item.history).toHaveLength(3)
    expect(item.history?.[0]).toMatchObject({ password: 'de-otro-gestor', origin: 'import' })
    expect(item.history?.map((one) => one.password)).not.toContain('vieja-3')
  })

  /*
   * The seed is not concatenated either, and for a sharper reason than the password:
   * two seeds mixed produce six plausible digits that no service accepts, which is the
   * silent failure `ADR-017` is built around.
   */
  it('does not merge two different seeds', () => {
    const { item, displaced } = mergeItems({ content: github({ totp: 'JBSWY3DPEHPK3PXP' }) }, [
      { content: github({ totp: 'KRSXG5CTMVRXEZLU' }) },
    ])

    expect(item.totp).toBe('JBSWY3DPEHPK3PXP')
    expect(displaced).toEqual([{ field: 'totp', value: 'KRSXG5CTMVRXEZLU', source: undefined }])
    expect(item.history).toBeUndefined()
  })

  /*
   * The addresses of one account differ between managers almost always —one carries the
   * path of the form— and that is not a conflict anybody should be asked about.
   */
  it('does not treat a different address as a conflict', () => {
    const { item, displaced } = mergeItems({ content: github({ url: 'https://github.com' }) }, [
      { content: github({ url: 'https://github.com/login?return_to=%2F' }) },
    ])

    expect(item.url).toBe('https://github.com')
    expect(displaced).toEqual([])
  })

  /*
   * SECOND BARRIER OF THE DOUBLE GUARD. `identityOf` keeps the types in separate groups,
   * so getting here with two of them means something upstream is wrong — and a card
   * merged into a login would leave the card's fields living invisibly inside it, which
   * is exactly what `ADR-020` fixed the type to prevent.
   */
  it('refuses to merge two entries of different types', () => {
    expect(() =>
      mergeItems({ content: github() }, [{ content: { ...github(), type: 'card' } }]),
    ).toThrow(/different types/)
  })

  /*
   * The fact the card fields rely on, as its own test, and it did not hold on its own:
   * two cards called the same DID group, through the name fallback, and the merge has no
   * rule for a card number that differs. `identityOf` now refuses to give a card an
   * identity at all, and this is what says so.
   */
  it('never groups two cards, which is why the merge needs no rule for their fields', () => {
    const card: ItemContent = { name: 'Amex', type: 'card', number: '378282246310005' }
    const another: ItemContent = { name: 'Amex', type: 'card', number: '4111111111111111' }

    expect(identityOf(card)).toBeNull()
    expect(groupDuplicates([card, another], [])).toEqual([])
  })

  /*
   * Notes are not cards: their one field is prose, which the merge keeps on both sides,
   * so two of them called the same are still worth flagging as repeated.
   */
  it('does group two notes called the same, whose fields can be kept side by side', () => {
    const wifi: ItemContent = { name: 'Wifi de casa', type: 'note', notes: 'una clave' }
    const other: ItemContent = { name: 'Wifi de casa', type: 'note', notes: 'otra clave' }

    expect(groupDuplicates([wifi, other], [])).toHaveLength(1)
    expect(mergeItems({ content: wifi }, [{ content: other }]).item.notes).toContain('otra clave')
  })

  it('respects the notes cap when both sides are long', () => {
    const long = 'x'.repeat(9000)
    const { item } = mergeItems({ content: github({ notes: long }) }, [
      { content: github({ notes: 'y'.repeat(9000) }) },
    ])

    expect(item.notes?.length).toBeLessThanOrEqual(10000)
  })

  it('merges more than two at once', () => {
    const { item, displaced } = mergeItems({ content: github({ password: 'una' }) }, [
      { content: github({ password: 'dos', notes: 'de aquí' }) },
      { content: github({ password: 'tres', totp: 'JBSWY3DPEHPK3PXP' }) },
    ])

    expect(item.password).toBe('una')
    expect(item.totp).toBe('JBSWY3DPEHPK3PXP')
    expect(item.notes).toBe('de aquí')
    expect(item.history?.map((one) => one.password)).toEqual(['dos', 'tres'])
    expect(displaced).toEqual([])
  })
})

describe('the writes an import comes down to', () => {
  const chrome: ItemContent = {
    name: 'GitHub',
    url: 'https://github.com',
    username: 'ada',
    password: 'la-de-chrome',
  }
  const nordpass: ItemContent = {
    name: 'GitHub',
    url: 'https://github.com/login',
    username: 'ada',
    password: 'la-de-nordpass',
    notes: 'la del trabajo',
  }
  const alone: ItemContent = { name: 'Banco', url: 'https://banco.es', username: 'ada' }

  const resolve = (incoming: ItemContent[], existing: ItemContent[], decision: GroupDecision) =>
    groupDuplicates(incoming, existing).map((group) => ({ group, decision }))

  it('creates one entry for a merged group, and the loser goes to its history', () => {
    const incoming = [chrome, nordpass, alone]
    const plan = planImport(incoming, [], resolve(incoming, [], 'merge'))

    expect(plan.create).toHaveLength(2)
    expect(plan.update).toEqual([])

    const merged = plan.create[0]

    expect(merged.notes).toBe('la del trabajo')
    expect(merged.history?.[0]).toMatchObject({ password: 'la-de-chrome', origin: 'import' })
  })

  /*
   * `discard` is the only outcome that destroys something, and what it destroys is
   * bounded: the password this merge would have stored, not whatever the survivor
   * already carried from its own rotations.
   */
  it('keeps no history when the group is discarded', () => {
    const incoming = [chrome, nordpass]
    const plan = planImport(incoming, [], resolve(incoming, [], 'discard'))

    expect(plan.create).toHaveLength(1)
    expect(plan.create[0].history).toBeUndefined()
  })

  it('leaves the survivor own history alone when discarding', () => {
    const rotated: ItemContent = {
      ...nordpass,
      history: [{ password: 'la-vieja', date: '2026-01-01T00:00:00.000Z', origin: 'rotation' }],
    }
    const incoming = [rotated, chrome]
    const plan = planImport(incoming, [], resolve(incoming, [], 'discard'))

    expect(plan.create[0].history?.map((one) => one.password)).toEqual(['la-vieja'])
  })

  /*
   * The heuristic can be wrong and there has to be a way to say so — otherwise two
   * accounts on one service get merged and finding that out costs more than never having
   * grouped them.
   */
  it('brings everything in when the group is separated', () => {
    const incoming = [chrome, nordpass]
    const plan = planImport(incoming, [], resolve(incoming, [], 'separate'))

    expect(plan.create).toEqual([chrome, nordpass])
  })

  /*
   * MERGING ONTO A STORED ENTRY UPDATES IT, and that is what keeping its id is for: the
   * alternative is creating a second entry and leaving the first, which is the duplicate
   * this whole iteration exists to remove.
   */
  it('updates the stored entry instead of creating a second one', () => {
    const plan = planImport([nordpass], [chrome], resolve([nordpass], [chrome], 'merge'))

    expect(plan.create).toEqual([])
    expect(plan.update).toHaveLength(1)
    expect(plan.update[0].index).toBe(0)
    expect(plan.update[0].content.notes).toBe('la del trabajo')
    expect(plan.update[0].content.password).toBe('la-de-chrome')
    expect(plan.update[0].content.history?.[0].password).toBe('la-de-nordpass')
  })

  /*
   * `ADR-011` §2.4 forbids an import deleting anything, and this is where that is kept
   * or lost: an entry the vault has and the file does not is never named by the plan.
   */
  it('never touches a stored entry the file says nothing about', () => {
    const untouched: ItemContent = { name: 'Otra', url: 'https://otra.es', username: 'ada' }
    const plan = planImport([chrome], [untouched], resolve([chrome], [untouched], 'merge'))

    expect(plan.update).toEqual([])
    expect(plan.create).toEqual([chrome])
  })

  it('creates every entry that is in no group at all', () => {
    const plan = planImport([alone, chrome], [], [])

    expect(plan.create).toEqual([alone, chrome])
  })

  /*
   * Whoever is choosing can pick the other password as the current one: it is the whole
   * point of the screen, and the proposal of #616 is only a proposal.
   */
  it('honours a survivor chosen by hand', () => {
    const incoming = [chrome, nordpass]
    const [group] = groupDuplicates(incoming, [])
    const plan = planImport(incoming, [], [
      { group, decision: 'merge', survivor: { from: 'file', index: 1 } },
    ])

    expect(plan.create[0].password).toBe('la-de-nordpass')
    expect(plan.create[0].history?.[0].password).toBe('la-de-chrome')
  })
})

describe('what an import says it did', () => {
  const chrome: ItemContent = {
    name: 'GitHub',
    url: 'https://github.com',
    username: 'ada',
    password: 'una',
  }
  const nordpass: ItemContent = { ...chrome, url: 'https://github.com/login', password: 'otra' }
  const agreeing: ItemContent = { ...chrome, notes: 'la del trabajo' }
  const alone: ItemContent = { name: 'Banco', url: 'https://banco.es', username: 'ada' }

  const summaryOf = (incoming: ItemContent[], decision: GroupDecision = 'merge') => {
    const resolved = groupDuplicates(incoming, []).map((group) => ({ group, decision }))

    return summarise(planImport(incoming, [], resolved), resolved)
  }

  it('counts what the vault gained', () => {
    expect(summaryOf([chrome, nordpass, alone]).created).toBe(2)
  })

  it('counts the groups that came in as one', () => {
    expect(summaryOf([chrome, nordpass, alone]).merged).toBe(1)
    expect(summaryOf([alone]).merged).toBe(0)
  })

  /*
   * THE NUMBER THAT MAKES THE HISTORY USABLE INSTEAD OF A DRAWER: how many entries were
   * left with two known passwords and nobody's word on which is current. Over the real
   * exports it is 25 of 668.
   */
  it('counts the ones left with two passwords and no answer', () => {
    expect(summaryOf([chrome, nordpass]).unresolved).toBe(1)
  })

  /*
   * A group whose passwords agree leaves nothing to review: merging it fills in gaps and
   * writes no history at all. Counting it would inflate the one number somebody is meant
   * to act on, which is how a count stops being read.
   */
  it('does not count a group whose passwords agreed', () => {
    expect(summaryOf([chrome, agreeing]).merged).toBe(1)
    expect(summaryOf([chrome, agreeing]).unresolved).toBe(0)
  })

  it('counts nothing as merged when the groups were separated', () => {
    const summary = summaryOf([chrome, nordpass], 'separate')

    expect(summary.merged).toBe(0)
    expect(summary.created).toBe(2)
    expect(summary.unresolved).toBe(0)
  })

  /*
   * `discard` merges and keeps no history, so it leaves nothing to review either — which
   * is exactly what somebody choosing it is saying.
   */
  it('leaves nothing to review when the loser was discarded', () => {
    expect(summaryOf([chrome, nordpass], 'discard').unresolved).toBe(0)
  })
})

describe("NordPass's CSV", () => {
  it('is no longer read as Chrome', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({ name: 'GitHub', url: 'https://github.com', username: 'ada', password: 'x', type: 'password' }),
    ].join('\n')

    expect((await parseImportFile(csv)).format).toBe('nordpass')
  })

  /*
   * The measured failure, as a test: a card came back as a login and its number went to
   * `notes`. `ADR-020` treats that number as a password everywhere — not painted, not
   * searched, copied with the clipboard-clearing helper — and this is the door that
   * undid all of it.
   */
  it('brings a card in as a card, with the number out of the notes', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({
        name: 'Amex',
        cardholdername: 'Ada Lovelace',
        cardnumber: '378282246310005',
        cvc: '1234',
        expirydate: '05/29',
        type: 'credit_card',
      }),
    ].join('\n')

    const [card] = (await parseImportFile(csv)).items

    expect(card.type).toBe('card')
    expect(card.number).toBe('378282246310005')
    expect(card.cardholder).toBe('Ada Lovelace')
    expect(card.csc).toBe('1234')
    expect(card.expiry).toBe('05/29')
    expect(card.notes ?? '').not.toContain('378282246310005')
  })

  it('brings a secure note in as a note', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({ name: 'Wifi', note: 'la clave de casa', type: 'note' }),
    ].join('\n')

    const [note] = (await parseImportFile(csv)).items

    expect(note.type).toBe('note')
    expect(note.notes).toBe('la clave de casa')
  })

  /*
   * `identity` HAS NO TYPE IN `ADR-020` AND NONE IS INVENTED FOR IT, which is #514's rule
   * surviving contact with a format that has more types than we do: it comes in as a
   * login and its columns go to the notes with their count, like any surplus.
   */
  it('does not invent a type for an identity', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({
        name: 'Mis datos',
        full_name: 'Ada Lovelace',
        phone_number: '600000000',
        city: 'Londres',
        type: 'identity',
      }),
    ].join('\n')

    const parsed = await parseImportFile(csv)

    expect(parsed.items[0]).not.toHaveProperty('type')
    expect(parsed.items[0].notes).toContain('Ada Lovelace')
    expect(parsed.movedFields).toEqual(expect.arrayContaining(['full_name', 'phone_number', 'city']))
  })

  /*
   * A FOLDER ROW IS NOT AN ENTRY. NordPass writes one per folder carrying only its name;
   * importing it would create an empty entry called «Trabajo». It is dropped and counted,
   * because dropping in silence is what `ADR-011` §2.4 forbids.
   */
  it('drops the row that is a folder and says how many', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({ name: 'Trabajo', type: 'folder' }),
      nordpassRow({ name: 'GitHub', url: 'https://github.com', username: 'ada', password: 'x', type: 'password' }),
    ].join('\n')

    const parsed = await parseImportFile(csv)

    expect(parsed.items).toHaveLength(1)
    expect(parsed.notItems).toBe(1)
    expect(parsed.skipped).toBe(0)
  })

  it('turns the folder of an entry into a tag', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({
        name: 'WP',
        url: 'https://wp.example',
        username: 'ada',
        password: 'x',
        folder: 'Wordpress',
        type: 'password',
      }),
    ].join('\n')

    expect((await parseImportFile(csv)).items[0].tags).toEqual(['Wordpress'])
  })

  it('does not report the type column as kept in the notes', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({ name: 'GitHub', url: 'https://github.com', username: 'ada', password: 'x', type: 'password' }),
    ].join('\n')

    const parsed = await parseImportFile(csv)

    expect(parsed.movedFields).not.toContain('type')
    expect(parsed.items[0].notes ?? '').not.toContain('password')
  })

  /*
   * The three columns that come empty in all 377 rows of the real export. `pin` is the
   * one worth naming: `ADR-020` has the field and NordPass the column, so the mapping is
   * written — but NOT ONE REAL ROW EXERCISES IT, and that is worth knowing before calling
   * its test verified.
   */
  it('fills in the pin when a row does carry one, which the real export never did', async () => {
    const csv = [
      NORDPASS_HEADER,
      nordpassRow({ name: 'Débito', cardnumber: '4111111111111111', pin: '9876', type: 'credit_card' }),
    ].join('\n')

    expect((await parseImportFile(csv)).items[0].pin).toBe('9876')
  })
})
