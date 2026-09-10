import { base64ToBytes, decrypt, deriveExportKey } from '@/lib/vault/crypto'
import { EXPORT_FORMAT, type ExportFile } from '@/lib/vault/export'
import { MAX_HISTORY, MAX_NOTES, MAX_SHORT, MAX_TAGS } from '@/lib/vault/schema'
import { parseTotp } from '@/lib/vault/totp'
import type { HistoryEntry, ItemContent } from '@/lib/vault/types'

/**
 * Bringing entries into eVault from a file. See ADR-011.
 *
 * Everything happens in the client: the file is read here, decrypted here when it has
 * to be, and every entry is encrypted here before leaving. The source file NEVER
 * travels to the server, not even to «validate the format», and there is a test that
 * checks it.
 */

/** Formats this knows how to read. */
export type ImportFormat =
  | 'evault'
  | 'evault-csv'
  | 'chrome'
  | 'bitwarden'
  | 'firefox'
  | 'nordpass'

/** What has been understood from the file, before anything is written. */
export interface ImportPreview {
  format: ImportFormat
  items: ItemContent[]
  /** Fields that do not fit the schema and have been kept in the notes. */
  movedFields: string[]
  /**
   * Columns deliberately left out, because they carry nothing a person could use.
   *
   * They are reported and not dropped quietly, which is `ADR-011` §2.4 applied to a
   * case it did not foresee: it was written for the user's own data, and Firefox is the
   * first format whose surplus is the PROGRAM's bookkeeping — identifiers and
   * timestamps. Keeping those would put five lines of machine noise in the notes of
   * every entry, and the notes are a field the search reads.
   */
  droppedFields: string[]
  /** Rows dropped for not even having a name. */
  skipped: number
  /**
   * Rows that are not entries at all, dropped and said so.
   *
   * NordPass writes one row per folder, carrying only its name: importing it would create
   * an empty entry. It is `ADR-011` §2.4's rule applied to something that section did not
   * foresee — what is dropped is not surplus data, it is a row that was never an item.
   */
  notItems: number
}

export type ImportProblem =
  | 'formato-desconocido'
  | 'formato-ambiguo'
  | 'passphrase-incorrecta'
  | 'version-desconocida'
  | 'fichero-vacio'

export class ImportError extends Error {
  readonly problem: ImportProblem

  constructor(problem: ImportProblem) {
    super(problem)
    this.name = 'ImportError'
    this.problem = problem
  }
}

/**
 * A CSV, respecting quotes and newlines inside fields.
 *
 * Written by hand instead of pulling in a dependency because the CSV that has to be
 * read is the one three specific programs write, not the universe of possible CSVs.
 * And a badly built parser here does not raise an error: it splits a field in two and
 * puts a password in the wrong column.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let insideQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]

    if (insideQuotes) {
      if (c === '"') {
        // Two quotes in a row are a literal quote, not the end of the field.
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          insideQuotes = false
        }
      } else {
        field += c
      }

      continue
    }

    if (c === '"') {
      insideQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((f) => f.some((value) => value !== ''))
}

/** What a header can be read as: the signature of a format, by name. */
export type FormatSignatures = Record<string, { required: string[] }>

/**
 * The columns each program is recognised by.
 *
 * SIGNATURES OVERLAP, AND THAT IS THE PROBLEM `detectFormat` EXISTS TO SOLVE. Chrome's
 * four columns are a subset of what nearly every manager exports, and Firefox's three
 * are a subset of Chrome's, so one file can match several of these at once.
 *
 * THERE USED TO BE AN `absent` FIELD HERE and #612 removed it, which is worth a line
 * because it was load-bearing. From #381, Firefox was told it must NOT have a `name`
 * column, so a Chrome file stopped matching it: the right fix for one collision, and one
 * that does not scale — saying of every format which columns it may not have is
 * quadratic, it gets forgotten, and forgetting it does not raise an error, it reads an
 * entry wrong. Specificity replaced it, and it was kept for a while «in case a format
 * needs to rule a column out». Nothing used it, so it is gone: three lines to bring back
 * the day a format actually needs it, and until then it is a branch no test can reach.
 */
const HEADERS: Record<Exclude<ImportFormat, 'evault'>, { required: string[] }> = {
  chrome: { required: ['name', 'url', 'username', 'password'] },
  /*
   * OUR OWN PLAINTEXT CSV, and the table of `ADR-011` §3 has listed it among the accepted
   * input formats since that ADR closed — so what this fixes is the code contradicting
   * the decision, not a missing convenience.
   *
   * Its first four columns are Chrome's too, so it was read as Chrome: the card came back
   * as a login WITH ITS NUMBER IN THE NOTES, the field the search reads. The same failure
   * as NordPass's, through the same door (#531, #610).
   *
   * Ten columns, so it beats NordPass's nine — and the two files never match each other
   * anyway: ours has `card_holder`, theirs `cardholdername`.
   */
  'evault-csv': {
    required: [
      'name',
      'url',
      'username',
      'password',
      'note',
      'favorite',
      'tags',
      'type',
      'card_holder',
      'card_number',
    ],
  },
  /*
   * Nine columns, and the four of Chrome are among them: NordPass's header starts with
   * exactly Chrome's, which is why it used to be read as Chrome and its cards came back
   * as logins with the number in the notes (#610). Specificity is what tells them apart
   * now — nine beats four — and the five extra are ones no other supported manager writes.
   */
  nordpass: {
    required: [
      'name',
      'url',
      'username',
      'password',
      'note',
      'cardholdername',
      'cardnumber',
      'cvc',
      'type',
    ],
  },
  bitwarden: { required: ['name', 'login_username', 'login_password'] },
  firefox: { required: ['url', 'username', 'password'] },
}

/**
 * The formats a set of headers could be read as, most specific first.
 *
 * IT TAKES THE SIGNATURES INSTEAD OF READING `HEADERS`, and the reason is said plainly
 * rather than dressed up: what has to be proved about this is a property of the
 * ALGORITHM — that a tie is refused instead of resolved — and no combination of the real
 * signatures produces a tie today, because Chrome covers the whole overlap between
 * Bitwarden and Firefox. A test that could only use the real signatures would leave that
 * branch unreachable, which is how a guard rots: it stays written, nothing exercises it,
 * and it stops working without anybody noticing.
 */
export function matchingFormats(
  headers: string[],
  signatures: FormatSignatures = HEADERS,
): string[] {
  const present = new Set(headers)

  return Object.keys(signatures)
    .filter((candidate) => signatures[candidate].required.every((column) => present.has(column)))
    .sort((a, b) => signatures[b].required.length - signatures[a].required.length)
}

/**
 * Which format a file's headers say it is. Throws rather than guess.
 *
 * IT IS THE MOST SPECIFIC MATCH AND NOT THE FIRST ONE, and #612 is why. It used to be a
 * `.find()` over `HEADERS`, which meant a file was read as whichever format happened to
 * be listed first among those it matched. That was invisible with three formats and one
 * collision; it stops being invisible the moment a manager exports Chrome's four columns
 * plus its own — and then the columns that told the two apart have nowhere to go, so they
 * fall through to the notes. Which is the field the search reads.
 *
 * AND COUNTING COLUMNS IS NOT ENOUGH ON ITS OWN. Bitwarden and Firefox ask for three
 * each and their signatures are disjoint, so a header carrying both sets matches the two
 * equally well. What saves it today is not the rule but an accident of these particular
 * signatures: any header matching both also matches Chrome, which asks for four and
 * wins. THAT IS A PROPERTY OF THE FORMATS WE HAPPEN TO SUPPORT, NOT OF THE ALGORITHM, and
 * the next format added can take it away without touching a line of this function.
 *
 * SO A TIE REFUSES, and that is worth reading twice, because refusing a file is a real
 * cost. The alternative is picking one of the two, and picking wrong is not a visible
 * failure: it is `login_password` landing in the notes while `password` is read as the
 * password, or the other way round. This module already says it does not guess — «an
 * import that reads the columns wrong puts passwords where names go, and that is found
 * out late» — and an ambiguous header is exactly the case that sentence describes.
 */
export function detectFormat(headers: string[], signatures: FormatSignatures = HEADERS): string {
  const matches = matchingFormats(headers, signatures)

  if (matches.length === 0) throw new ImportError('formato-desconocido')

  const [best, second] = matches

  if (second && signatures[second].required.length === signatures[best].required.length) {
    throw new ImportError('formato-ambiguo')
  }

  return best
}

/**
 * Columns that are left out on purpose, per format.
 *
 * THIS LIST IS AN EXCEPTION TO `ADR-011` §2.4 AND IS WRITTEN DOWN AS ONE. That section
 * says what does not fit is kept in the notes and its count reported, and it is right —
 * for the user's data. Firefox is the first format whose surplus is not the user's data
 * but the program's: a `guid` and three timestamps, five lines of machine noise per
 * entry, in a field that `search.ts` reads on purpose because that is where «the work
 * account» ends up.
 *
 * The spirit of §2.4 is kept, which is what matters: nothing is discarded in SILENCE.
 * These columns are reported as dropped, by name, before anything is written.
 *
 * `httpRealm` is NOT here, and the distinction is the whole reason this is a list and
 * not a rule: it is the only surplus column that says something the URL does not —
 * that the credential is for HTTP authentication and not for a form. `formActionOrigin`
 * is, because for a form login it repeats the URL.
 */
const NOISE_COLUMNS: Partial<Record<Exclude<ImportFormat, 'evault'>, string[]>> = {
  firefox: ['formactionorigin', 'guid', 'timecreated', 'timelastused', 'timepasswordchanged'],
}

/**
 * The fields of an item that an imported column can land in.
 *
 * NOT `keyof ItemContent`, and #377 is why: `favourite` is `true | undefined`, so a map
 * pointing at it would let a column be assigned a string where only `true` fits. It
 * used to type-check because every field was a string; it stopped the day the blob
 * gained one that is not.
 *
 * Listing them also says something true: **what an import can fill in is the text of an
 * entry**, and nothing else. A CSV does not carry favourites.
 */
type ImportableField =
  | 'name'
  | 'username'
  | 'password'
  | 'url'
  | 'notes'
  | 'totp'
  | 'cardholder'
  | 'number'
  | 'expiry'
  | 'csc'
  | 'pin'

/** Which column goes to which field of the item. The rest is kept in the notes. */
const FIELD_MAP: Record<Exclude<ImportFormat, 'evault'>, Record<string, ImportableField>> = {
  chrome: { name: 'name', url: 'url', username: 'username', password: 'password', note: 'notes' },
  bitwarden: {
    name: 'name',
    login_uri: 'url',
    login_username: 'username',
    login_password: 'password',
    notes: 'notes',
    /*
     * ADR-017 §4 asked for this one by name, and what it fixes is not tidiness: without
     * it `login_totp` falls through to the notes, and NOTES ARE WHAT THE SEARCH READS.
     * A seed is a secret that outlives a password —rotating one takes five minutes,
     * replacing the other means reconfiguring the second factor account by account— so
     * having it sitting in an indexed field is the opposite of how ADR-017 says to treat
     * it.
     *
     * Bitwarden is the only accepted format that carries one: Chrome and Firefox have no
     * such column, and eVault's own plaintext CSV withholds the seed by design (#420).
     */
    login_totp: 'totp',
  },
  /*
   * No `name`, because Firefox's file has no such column: it identifies a credential by
   * its URL. The name is derived in `nameFromUrl` below.
   */
  firefox: { url: 'url', username: 'username', password: 'password' },
  /*
   * THE FIVE CARD FIELDS ARRIVE HERE, and it is the first format where they do. Until
   * #614 no foreign CSV could fill in a card —`FIELD_MAP` had no target for them, so a
   * column called `card_number` landed in the notes like any other surplus (#514)— and
   * that was right while no supported format carried one.
   *
   * NordPass does, and letting them fall through is not neutral: `ADR-020` treats a card
   * number as a password everywhere —not painted in the list, not searched, copied with
   * the clipboard-clearing helper— and the notes are the one field the search reads. The
   * measured consequence was a card coming back as a login with its number searchable
   * (#610).
   */
  /*
   * Our own, and it is the only format whose column names we chose: they are `export.ts`'s
   * `PLAIN_EXPORT`, read back. `totp` and `history` have no column at all — the plaintext
   * file withholds them (`ADR-017` §2.3, `ADR-018` §2.3) — so there is nothing here to
   * read them from, and a round trip through this file loses them by design.
   */
  'evault-csv': {
    name: 'name',
    url: 'url',
    username: 'username',
    password: 'password',
    note: 'notes',
    card_holder: 'cardholder',
    card_number: 'number',
    card_expiry: 'expiry',
    card_code: 'csc',
    card_pin: 'pin',
  },
  nordpass: {
    name: 'name',
    url: 'url',
    username: 'username',
    password: 'password',
    note: 'notes',
    cardholdername: 'cardholder',
    cardnumber: 'number',
    cvc: 'csc',
    pin: 'pin',
    expirydate: 'expiry',
  },
}

/**
 * How a format's own type column maps onto the two types of `ADR-020`.
 *
 * THIS IS NOT THE SAME AS INVENTING A TYPE, and the distinction is what #514 settled:
 * that issue fixed that a foreign CSV must not have its `type` column read as ours,
 * because a column called `type` in an unrecognised file means whatever its writer
 * decided. A RECOGNISED format is a different case — its vocabulary is known, and reading
 * it is the opposite of guessing.
 *
 * What is not listed is not translated: a NordPass `identity` has no type in `ADR-020`
 * and does not get one invented for it. It comes in as a login and its columns go to the
 * notes with their count, which is `ADR-011` §2.4 — the same treatment as any surplus.
 */
const TYPE_COLUMN: Partial<
  Record<
    Exclude<ImportFormat, 'evault'>,
    {
      column: string
      /**
       * What each value of that column means here. `'login'` is a value that IS
       * understood and maps to no type, because `ADR-020` says an absent type is a login.
       *
       * Saying it rather than leaving it out of the map is what separates «understood and
       * it means a login» from «not understood»: the second is reported among the moved
       * columns, and the first would be reported too if it were missing here — telling
       * somebody something was kept when it was in fact used.
       */
      types: Record<string, ItemContent['type'] | 'login'>
      notAnItem?: string[]
    }
  >
> = {
  /*
   * Our own file writes the two values of `ADR-020` verbatim, because they are what is
   * inside the blob. An empty cell is a login.
   */
  'evault-csv': {
    column: 'type',
    types: { '': 'login', card: 'card', note: 'note' },
  },
  nordpass: {
    column: 'type',
    types: { password: 'login', credit_card: 'card', note: 'note' },
    /*
     * `folder` IS NOT AN ENTRY. NordPass writes one row per folder carrying only its
     * name — no url, no user, no password, no note. Importing it would create an empty
     * entry called «Trabajo», and dropping it in silence is what `ADR-011` §2.4 forbids,
     * so it is counted and said.
     */
    notAnItem: ['folder'],
  },
}

/**
 * Which column says an entry is a favourite, for the formats that have one.
 *
 * ONLY OURS, and the reason is not that others lack the column — Bitwarden has one — but
 * that ours is the only file whose vocabulary we wrote: `export.ts` puts the string
 * `true` there and nothing else, so reading it back is reading our own output. Guessing
 * what another manager's `1`, `yes` or `favorite` means is the kind of interpretation
 * that #514 refused for types.
 *
 * `true` OR THE KEY IS ABSENT, never `false`, which is `FOUNDATION.md` §2's contract.
 */
const FAVOURITE_COLUMN: Partial<Record<Exclude<ImportFormat, 'evault'>, string>> = {
  'evault-csv': 'favorite',
}

/**
 * Which column carries the tags, and what separates them when there are several.
 *
 * The separator is per format because it is theirs and not ours: our own file writes
 * `a;b`, which is what `export.ts` produces, and reading it with the wrong one would turn
 * two tags into one called «a;b».
 */
const TAG_COLUMN: Partial<
  Record<Exclude<ImportFormat, 'evault'>, { column: string; separator: string }>
> = {
  'evault-csv': { column: 'tags', separator: ';' },
  /*
   * NordPass's folder becomes a tag, which is the translation #378 already chose when it
   * picked tags over folders. Leaving it in the notes would turn something the model can
   * represent into searchable prose.
   *
   * It is close to decorative in practice: the real export has ONE row with a folder
   * (#610). It is written because the column exists and not because it carries weight.
   */
  nordpass: { column: 'folder', separator: ',' },
}

/**
 * The name of an entry whose file does not carry one.
 *
 * WITHOUT THIS, A FIREFOX FILE IS DISCARDED ENTIRELY, row by row: `toItem` returns null
 * when there is no name, so mapping the columns alone would not have been enough. It is
 * the finding that makes #381 more than «one more header in the map».
 *
 * The host without `www.` is what the other managers use and what the person recognises:
 * they know they have an account at github.com, not at
 * `https://github.com/login?return_to=%2F`.
 *
 * IT FALLS BACK TO THE RAW TEXT INSTEAD OF GIVING UP, and that is the decision that
 * matters here: a URL that does not parse is still better as a name than dropping the
 * entry. Losing a password because its address was odd is the worst thing this import
 * could do.
 */
function nameFromUrl(url: string): string {
  const raw = url.trim()

  if (!raw) return ''

  // Firefox writes full URLs, but a file edited by hand may not have the scheme, and
  // `new URL` needs one. Trying twice is cheaper than a regular expression for hosts.
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      const host = new URL(candidate).hostname.replace(/^www\./, '')

      if (host) return host
    } catch {
      // Not a URL under this reading; the next one, or the raw text.
    }
  }

  return raw
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value
}

/**
 * Turns a row into an item, keeping whatever does not fit.
 *
 * What does not fit the five fields is NOT dropped: it is appended to the notes with
 * its name in front. Losing data in a migration without saying so is the worst way
 * this feature can fail, because the user sees «imported» and deletes the source. See
 * ADR-011.
 */
function toItem(
  headers: string[],
  row: string[],
  format: Exclude<ImportFormat, 'evault'>,
  moved: Set<string>,
  dropped: Set<string>,
): ItemContent | null | 'not-an-item' {
  const fieldMap = FIELD_MAP[format]
  const noise = new Set(NOISE_COLUMNS[format] ?? [])
  const typing = TYPE_COLUMN[format]
  const tagColumn = TAG_COLUMN[format]
  const favouriteColumn = FAVOURITE_COLUMN[format]
  const item: ItemContent = { name: '' }
  const extras: string[] = []

  if (typing) {
    const said = (row[headers.indexOf(typing.column)] ?? '').trim()

    if (typing.notAnItem?.includes(said)) return 'not-an-item'

    const known = typing.types[said]

    if (known && known !== 'login') item.type = known

    /*
     * A VALUE THIS FORMAT DID NOT DECLARE IS NOT UNDERSTOOD, so it is reported rather than
     * ignored — NordPass's `identity` is the real case. Silently dropping it would be the
     * failure `ADR-011` §2.4 calls the worst one, on the very field that decides what the
     * rest of the entry means.
     */
    if (known === undefined && said !== '') moved.add(typing.column)
  }

  headers.forEach((header, index) => {
    const value = (row[index] ?? '').trim()

    if (value === '') return

    /*
     * The type column has been read above, so it does not fall through to the notes: it
     * is understood, not surplus. Reporting it as moved would say something was kept
     * that was in fact used.
     */
    if (header === typing?.column) return

    if (header === favouriteColumn) {
      if (value === 'true') item.favourite = true

      return
    }

    if (header === tagColumn?.column) {
      item.tags = [
        ...new Set(
          value
            .split(tagColumn.separator)
            .map((one) => one.trim())
            .filter(Boolean),
        ),
      ]

      return
    }

    if (noise.has(header)) {
      dropped.add(header)

      return
    }

    const target = fieldMap[header]

    if (target) {
      /*
       * A SEED THAT CANNOT BE READ DOES NOT GO INTO THE FIELD, and it is not dropped
       * either. Written there it would produce six plausible digits that no service
       * accepts, with nothing failing — the failure mode this whole feature is built
       * around. So it falls through to the notes, which is ADR-011 §2.4's rule for what
       * does not fit, and gets counted among the moved columns so the import says it.
       *
       * IT IS A TRADE AND NOT A CLEAN WIN, worth writing because it sits against the
       * paragraph above: a value that WAS meant to be a seed ends up in a field the
       * search reads. It is the lesser evil — the alternative is discarding in silence
       * what somebody may need to set that factor up again, and `ADR-011` calls that the
       * worst way this can fail.
       */
      if (target === 'totp' && !isReadableSeed(value)) {
        extras.push(`${header}: ${value}`)
        moved.add(header)

        return
      }

      item[target] = value

      return
    }

    extras.push(`${header}: ${value}`)
    moved.add(header)
  })

  /*
   * Derived only when the FORMAT has no name column, which today means Firefox. Without
   * this every one of its rows would be dropped by the check below.
   *
   * NOT WHEN THE FORMAT HAS THE COLUMN AND THE ROW LEFT IT EMPTY, and that was asked as
   * its own question in #401 rather than settled inside a change about Firefox.
   *
   * THE ANSWER CAME FROM MEASURING, AND IT IS ZERO: over a real Chrome export of 618
   * credentials, not one row has an empty `name`. So the case this would rescue does
   * not occur, and deriving there would mean inventing a name the user never typed for
   * a row that never arrives.
   *
   * If it ever does arrive, the count of rows dropped for having no name is already
   * reported before anything is written, which is what would make it visible.
   */
  if (!item.name && !Object.values(fieldMap).includes('name')) {
    item.name = nameFromUrl(item.url ?? '')
  }

  if (!item.name) return null

  if (extras.length > 0) {
    const extrasHeader = 'Importado de otro gestor:'
    item.notes = [item.notes, extrasHeader, ...extras].filter(Boolean).join('\n')
  }

  // The schema's caps apply all the same: what the client does not validate nobody
  // validates, and a bulk import is its stress test.
  item.name = truncate(item.name, MAX_SHORT)
  if (item.username) item.username = truncate(item.username, MAX_SHORT)
  if (item.password) item.password = truncate(item.password, MAX_SHORT)
  if (item.url) item.url = truncate(item.url, MAX_SHORT)
  if (item.notes) item.notes = truncate(item.notes, MAX_NOTES)

  return item
}

/**
 * Whether a value can be read as a TOTP seed, so it is worth putting in the field.
 *
 * IT IS `parseTotp` AND NOT A REGULAR EXPRESSION, on purpose: the same code that will
 * produce the codes decides here, so anything that passes will work. A pattern over the
 * shape would accept a base32 string that decodes to the wrong bytes, which looks
 * exactly like one that decodes to the right ones.
 *
 * The length cap is the schema's, and it is checked rather than truncated: cutting a
 * seed does not shorten it, it breaks it.
 */
function isReadableSeed(value: string): boolean {
  if (value.length > MAX_SHORT) return false

  try {
    parseTotp(value)

    return true
  } catch {
    return false
  }
}

/**
 * Reads a file and says what it understood, writing nothing.
 *
 * It never guesses: if it does not recognise the headers, it fails and says so. An
 * import that reads the columns wrong puts passwords where names go, and that is found
 * out late.
 */
export async function parseImportFile(text: string, passphrase?: string): Promise<ImportPreview> {
  const trimmed = text.trim()

  if (trimmed === '') throw new ImportError('fichero-vacio')

  // The native format is recognised by its header, not by the extension.
  if (trimmed.startsWith('{')) {
    let file: ExportFile

    try {
      file = JSON.parse(trimmed) as ExportFile
    } catch {
      throw new ImportError('formato-desconocido')
    }

    if (file.format !== EXPORT_FORMAT) throw new ImportError('formato-desconocido')

    /*
     * The version is checked BEFORE any attempt to decrypt. A file of an unknown
     * version is refused with an explanation, rather than read to see whether it
     * happens to work. See ADR-011.
     */
    if (file.version !== 1) throw new ImportError('version-desconocida')

    try {
      const key = await deriveExportKey(
        passphrase ?? '',
        base64ToBytes(file.kdf.salt),
        file.kdf.iterations,
      )

      const decrypted = JSON.parse(
        await decrypt(key, { data: file.ciphertext, iv: file.cipher.iv }),
      ) as { items: ItemContent[] }

      return {
        format: 'evault',
        items: decrypted.items,
        movedFields: [],
        droppedFields: [],
        skipped: 0,
        notItems: 0,
      }
    } catch {
      // With AES-GCM, a wrong passphrase and a tampered file are indistinguishable:
      // both fail the authentication tag.
      throw new ImportError('passphrase-incorrecta')
    }
  }

  const rows = parseCsv(trimmed)

  if (rows.length < 2) throw new ImportError('fichero-vacio')

  const headers = rows[0].map((c) => c.trim().toLowerCase())

  const format = detectFormat(headers) as Exclude<ImportFormat, 'evault'>

  const moved = new Set<string>()
  const dropped = new Set<string>()
  const items: ItemContent[] = []
  let skipped = 0
  let notItems = 0

  for (const row of rows.slice(1)) {
    const item = toItem(headers, row, format, moved, dropped)

    if (item === 'not-an-item') {
      notItems += 1

      continue
    }

    if (item === null) {
      skipped += 1

      continue
    }

    items.push(item)
  }

  return {
    format,
    items,
    movedFields: [...moved],
    droppedFields: [...dropped],
    skipped,
    notItems,
  }
}

/**
 * What makes two entries «the same account», as `ADR-022` §2.1 decides it.
 *
 * THE HOST AND THE USER, NOT THE NAME AND THE USER, and #615 is why. The name is the one
 * field every manager writes its own way: Chrome carries whatever its owner typed and
 * Firefox has no name column at all, so `nameFromUrl` derives it from the host. Comparing
 * by it works when both rows come from the same program — which is the case this used to
 * be written for, reimporting one file — and sees nothing across two. Measured over the
 * real exports in #610: the old criterion found **131 of the 261 groups that are there**.
 *
 * THE NAME IS STILL THE FALLBACK WHEN THERE IS NO ADDRESS, and that is not a leftover:
 * an entry with no URL —a note, a card, a login nobody gave an address to— has nothing
 * else identifying it, and dropping it from the grouping would lose the case #442 exists
 * for. What it does NOT do is group everything without a host together: the fallback is
 * the entry's own name, so two unrelated notes stay apart.
 *
 * BOTH SIDES LOWERCASED, which `ADR-022` §2.1 keeps for a reason that is not volume —
 * over the real files it moves one group— but shape: two addresses of the same person
 * differing only in case are not two accounts.
 *
 * The dominant registrable domain was measured and REJECTED: it would fold
 * `dev.`, `pre.` and the production host of one site into a single account, and those
 * are different credentials on purpose. See `ADR-022` §2.1.
 */
export function identityOf(item: ItemContent): string | null {
  const host = item.url?.trim() ? nameFromUrl(item.url) : item.name

  if (!host?.trim()) return null

  /*
   * THE TYPE IS PART OF THE IDENTITY, which is `ADR-020` reaching this far: the type is
   * fixed when an entry is created and never changed, because changing it would leave the
   * previous type's fields living invisibly inside — a password nobody sees inside a
   * card. Two entries of different types are therefore not the same thing, however much
   * their host and user agree, and they must not even be offered as a group: there is no
   * outcome anybody could pick.
   *
   * Absent means a login, so every entry written before `ADR-020` keys the same as one
   * written today.
   */
  const kind = item.type ?? 'login'

  /*
   * A CARD IS NEVER GROUPED WITH ANOTHER, and this is the one rule here that came from a
   * test rather than from the ADR. `ADR-022` §2.5 says two entries of different types are
   * not merged; it did not consider two of the SAME type whose fields cannot be merged at
   * all.
   *
   * A card's fields are secrets that neither concatenate nor displace: two notes can be
   * kept side by side and a losing password has the history of `ADR-018` waiting for it,
   * but a card number that differs has nowhere to go — keeping the survivor's would drop
   * the other in silence, which is the failure this whole import is built to avoid.
   *
   * And the likely reading of two cards called «Amex» is not one card twice: it is two
   * cards from the same bank, told apart by exactly the fields a merge would collide on.
   *
   * The cost is small and measured: NordPass is the only source that exports cards at
   * all, four of them, and no source duplicates one (#610).
   */
  if (kind === 'card') return null

  return [
    kind,
    host.trim().toLowerCase(),
    (item.username ?? '').trim().toLowerCase(),
  ].join('\u0000')
}

/** Entries that look like the same account, from the file and from the vault. */
export interface DuplicateGroup {
  /** What they share. Opaque: it exists to key the group, not to be shown. */
  identity: string
  /** Positions in the incoming list, in the file's order. */
  incoming: number[]
  /**
   * Positions in the stored list that fall in this group.
   *
   * POSITIONS AND NOT THE ENTRIES THEMSELVES, symmetrical with `incoming` and for a
   * reason that only shows up when something is written: merging onto a stored entry
   * UPDATES it, and updating needs its id. The content alone cannot be traced back to
   * the item it came from.
   */
  existing: number[]
  /**
   * Which one is PROPOSED to be kept. A proposal: nothing is written from this.
   *
   * `index` points into the stored list or into the incoming one, depending on `from`.
   * See `survivorOf`.
   */
  survivor: { from: 'vault' | 'file'; index: number }
}

/**
 * How much an entry says, counted as filled-in fields.
 *
 * IT IS A COUNT AND NOT A SCORE, and that is the whole design: weighing a `totp` above a
 * `url` would need a reason, and any reason would be invented. What can be said without
 * inventing anything is that an entry with a seed, notes and an address carries more
 * than one with a user and a password, and that keeping the first loses less.
 *
 * Empty arrays and blank strings do not count: an entry does not become more complete by
 * carrying a key that says nothing, which is the same contract `FOUNDATION.md` §2 gives
 * `favourite` and `tags`.
 */
export function completeness(item: ItemContent): number {
  return Object.values(item).filter((value) => {
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) return value.length > 0

    return String(value).trim() !== ''
  }).length
}

/**
 * Which entry of a group is proposed to be kept.
 *
 * WHAT IS ALREADY STORED WINS, WHATEVER IT SAYS, and that is the first rule because it
 * is not about content: a stored entry has an id, its dates and whatever was edited by
 * hand after importing it. Merging onto it UPDATES it (#623); proposing an incoming row
 * instead would mean creating a new entry and leaving the old one, which is the
 * duplicate this whole iteration exists to avoid. What the incoming row knows and the
 * stored one does not is not lost either — the merge fills the gaps (#617).
 *
 * AMONG EQUALS, THE MOST COMPLETE, and among equally complete, the first — the file's
 * order, so «the first» is the one the exporting program wrote first.
 *
 * AND IT DOES NOT LOOK AT DATES, because there are none. #610 measured it over the real
 * exports: Chrome and NordPass do not carry when a password was changed, and Firefox's
 * column is in `NOISE_COLUMNS` since #381 for being the program's bookkeeping. The
 * comment this function replaces was right when it said no better rule exists without
 * knowing which password is current, and there is still nothing to know it from.
 *
 * WHICH MATTERS LESS THAN IT LOOKS, and the measurement says so too: in 236 of the 261
 * groups the passwords are identical, so the choice changes nothing. Where it does
 * change something — 25 groups — it is a proposal on a screen and a person decides.
 */
export function survivorOf(
  group: Pick<DuplicateGroup, 'incoming' | 'existing'>,
  incoming: ItemContent[],
  existing: ItemContent[] = [],
): DuplicateGroup['survivor'] {
  const best = <T>(candidates: T[], contentOf: (candidate: T) => ItemContent): T =>
    candidates.reduce((winner, candidate) =>
      completeness(contentOf(candidate)) > completeness(contentOf(winner)) ? candidate : winner,
    )

  if (group.existing.length > 0) {
    return { from: 'vault', index: best(group.existing, (index) => existing[index]) }
  }

  return { from: 'file', index: best(group.incoming, (index) => incoming[index]) }
}

/**
 * The incoming entries grouped with whatever looks like the same account.
 *
 * IT GROUPS; IT DOES NOT DECIDE. There is no stable identifier across two managers, so
 * «the same item» can only ever be a heuristic — `ADR-011` §2.4 said so and `ADR-022`
 * keeps it: what this returns is a proposal, and a person resolves it.
 *
 * IT RETURNS GROUPS AND NOT INDEXES, which is the whole of #615 beyond the identity
 * itself. A `Set<number>` can say «these look repeated», which is all a tick box needs;
 * it cannot say WHO each one is repeated with, and without that there is nothing to show
 * a difference against or to choose between.
 *
 * Only groups with more than one member are returned: an entry that collides with
 * nothing is not a decision anybody has to take.
 */
export function groupDuplicates(
  incoming: ItemContent[],
  existing: ItemContent[],
): DuplicateGroup[] {
  const groups = new Map<string, Omit<DuplicateGroup, 'survivor'>>()
  const groupFor = (identity: string) => {
    const found = groups.get(identity) ?? { identity, incoming: [], existing: [] }

    groups.set(identity, found)

    return found
  }

  existing.forEach((item, index) => {
    const identity = identityOf(item)

    if (identity) groupFor(identity).existing.push(index)
  })

  incoming.forEach((item, index) => {
    const identity = identityOf(item)

    if (identity) groupFor(identity).incoming.push(index)
  })

  return [...groups.values()]
    .filter(
      (group) => group.incoming.length > 0 && group.incoming.length + group.existing.length > 1,
    )
    .map((group) => ({ ...group, survivor: survivorOf(group, incoming, existing) }))
}

/**
 * Which of the incoming ones look repeated, as a set of positions.
 *
 * THE VIEW OF `groupDuplicates` THAT TODAY'S DIALOG NEEDS, and it stays until #619
 * replaces that screen: a tick box per row only needs to know which rows come unticked.
 *
 * THE FIRST OF A GROUP SURVIVES AND THE REST ARE FLAGGED, which had to be decided rather
 * than fallen into: flagging all of them would leave somebody unticking every copy to
 * keep one. Order is the file's, so «the first» is the one the exporting program wrote
 * first — and when the group already has something stored, every incoming row is flagged,
 * because the survivor is the one already in the vault.
 *
 * No better rule exists without knowing which password is current, and there is no such
 * thing to know: #610 measured it and none of the three sources exports the date a
 * password was changed. See `ADR-022` §3.
 */
export function findDuplicates(incoming: ItemContent[], existing: ItemContent[]): Set<number> {
  const repeated = new Set<number>()

  for (const group of groupDuplicates(incoming, existing)) {
    const survivor = group.survivor.from === 'file' ? group.survivor.index : undefined

    for (const index of group.incoming) {
      if (index !== survivor) repeated.add(index)
    }
  }

  return repeated
}

/** An entry to be merged, with where it came from — for the notes to say so. */
export interface Sourced {
  content: ItemContent
  /** What to call its origin in the notes. Omitted when there is nothing to say. */
  source?: string
}

/**
 * A secret that did not fit the merge and has nowhere to go yet.
 *
 * IT IS RETURNED INSTEAD OF DROPPED, and that is the whole point of this type existing
 * before #618 does: the merge cannot write history yet, and losing a password because
 * the feature that stores it is not written is exactly the failure `ADR-011` §2.4 calls
 * the worst way an import can fail.
 *
 * SINCE #618 A DISPLACED PASSWORD IS NOT ONE OF THESE: it goes straight into the entry's
 * `history`, marked `origin: 'import'`, which is what `ADR-022` §2.2 admits and what its
 * mark is for. What is left here is what has nowhere to go.
 *
 * WHICH TODAY IS ONLY THE SEED, and it is said rather than assumed: `ADR-018` created a
 * history of PASSWORDS and a seed is not one. It cannot fall through to the notes either,
 * because that is the field the search reads and `ADR-017` §4 exists to keep it out. What
 * makes leaving it open affordable is that it does not occur — none of the three sources
 * of this iteration exports a TOTP seed at all (#610), so the only way here is a
 * `.evault` against a vault that already had one. The screen of #619 shows what comes
 * back in this list and lets somebody decide; nothing is dropped in silence.
 */
export interface DisplacedSecret {
  field: 'totp'
  value: string
  /** Where it came from, when its entry said. */
  source?: string
}

export interface MergeResult {
  item: ItemContent
  /** What could not be kept in a single entry, in the order it was found. */
  displaced: DisplacedSecret[]
}

/**
 * Two or more entries that look like one account, turned into a single entry.
 *
 * WHAT THE SURVIVOR LACKS AND ANOTHER HAS IS COPIED, without asking: there is no conflict
 * to resolve in an empty field, and leaving it empty would throw away what somebody's
 * other manager knew. It is the reason the survivor is chosen by identity and not by
 * content (#616) — what it does not know, it learns here.
 *
 * TAGS ARE UNIONED, which is what #378 made possible by choosing tags over folders: an
 * entry can be in two places, so there is nothing to choose between.
 *
 * NOTES ARE CONCATENATED WHEN THEY DIFFER, each labelled with where it came from, rather
 * than one winning. They are prose written by a person: picking one is losing the other,
 * and the field is large enough that keeping both costs nothing worth counting.
 *
 * THE PASSWORD AND THE SEED ARE NEVER MERGED. Concatenating two passwords produces one
 * that opens nothing; concatenating two seeds produces six digits no service accepts —
 * which is the failure mode `ADR-017` warns about, plausible and silent. The survivor's
 * wins and the other is displaced, not dropped.
 *
 * AND TWO ENTRIES OF DIFFERENT TYPES ARE NOT MERGED AT ALL. `identityOf` already keeps
 * them in separate groups, so reaching here with mixed types means something upstream is
 * wrong; this is the second barrier of the double guard this project applies wherever
 * a decision about somebody's data is taken.
 */
/**
 * The text fields a merge can fill in from another entry.
 *
 * LISTED AND NOT DERIVED FROM `keyof ItemContent`, for the reason #377 already wrote a
 * few lines up about `ImportableField`: `favourite` is `true | undefined` and `tags` is
 * an array, so a generic walk over the keys would assign a string where only `true`
 * fits. It type-checked while every field was a string and stopped the day one was not.
 *
 * `name` is not here: it is the survivor's, which is what choosing a survivor means.
 * `type` is not here either — it is equal by construction, and `identityOf` is what makes
 * sure of that.
 *
 * THE FOUR CARD FIELDS ARE, and they never actually arrive: a card carries no host and no
 * user, so `identityOf` gives it no identity and two cards are never grouped. They are
 * listed because leaving them out would be a rule that depends on a fact somewhere else
 * — and there is a test on that fact.
 */
const MERGEABLE_TEXT = [
  'username',
  'password',
  'url',
  'totp',
  'cardholder',
  'number',
  'expiry',
  'csc',
  'pin',
] as const satisfies readonly (keyof ItemContent)[]

export function mergeItems(survivor: Sourced, others: Sourced[]): MergeResult {
  const item: ItemContent = { ...survivor.content }
  const displaced: DisplacedSecret[] = []
  const history: HistoryEntry[] = []
  const now = new Date().toISOString()
  const notes: { text: string; source?: string }[] = survivor.content.notes?.trim()
    ? [{ text: survivor.content.notes.trim(), source: survivor.source }]
    : []

  for (const other of others) {
    if ((other.content.type ?? 'login') !== (item.type ?? 'login')) {
      throw new Error('mergeItems: entries of different types are not the same entry')
    }

    for (const field of MERGEABLE_TEXT) {
      const theirs = other.content[field]?.trim()

      if (!theirs) continue

      const mine = item[field]?.trim()

      if (!mine) {
        item[field] = other.content[field]

        continue
      }

      /*
       * A DIFFERENCE IN ANY OTHER FIELD IS NOT A CONFLICT WORTH RAISING: two managers
       * write the address of one account differently —`github.com` against
       * `github.com/login?return_to=%2F`— and the user field carries the same account
       * spelled the same way or it would not have grouped. The survivor's wins.
       */
      if (theirs === mine) continue

      /*
       * THE LOSING PASSWORD GOES TO THE HISTORY, marked as coming from an import, which
       * is the second door `ADR-022` §4 admits into a field `ADR-018` §4 wanted written
       * from one place only. It is not editing an entry: it is building one out of two.
       *
       * `import` AND NOT `rotation`, and the whole honesty of the field is in that word.
       * Nobody retired this password — two managers disagreed and it is unknown which one
       * is current. Writing `rotation` would claim it was retired, and dating it as if it
       * had been retired the day somebody imported a file.
       */
      if (field === 'password') {
        history.push({
          password: other.content.password as string,
          date: now,
          origin: 'import',
        })

        continue
      }

      if (field === 'totp') {
        displaced.push({ field, value: other.content.totp as string, source: other.source })
      }
    }

    // Union, like the tags: an entry that is a favourite anywhere is a favourite.
    if (other.content.favourite) item.favourite = true

    if (other.content.tags?.length) {
      item.tags = [...new Set([...(item.tags ?? []), ...other.content.tags])].slice(0, MAX_TAGS)
    }

    const theirNotes = other.content.notes?.trim()

    if (theirNotes && !notes.some((one) => one.text === theirNotes)) {
      notes.push({ text: theirNotes, source: other.source })
    }
  }

  /*
   * The survivor's own history comes first: what it already knew about its past outranks
   * what this reconciliation just learnt, and the cap drops the oldest.
   *
   * `ADR-022` §2.7: when a group brings more passwords than fit, the cap is respected and
   * the ones left out are counted rather than dropped in silence. What gets dropped is
   * what was already confirmed, keeping the undecided — a password retired long ago is
   * worth less than one that may still be the good one.
   */
  if (history.length > 0) {
    const all = [...(item.history ?? []), ...history]
    const undecided = all.filter((one) => one.origin === 'import')
    const rest = all.filter((one) => one.origin !== 'import')

    item.history = [...undecided, ...rest].slice(0, MAX_HISTORY)
  }

  if (notes.length > 0) {
    const labelled = notes.map((one) =>
      notes.length > 1 && one.source ? `[${one.source}]\n${one.text}` : one.text,
    )

    item.notes = truncate(labelled.join('\n\n'), MAX_NOTES)
  }

  return { item, displaced }
}

/**
 * What has been decided about one group of entries that look like the same account.
 *
 * `merge` — one entry. What the survivor lacks is filled in and the losing password goes
 * to its history, marked `import`. Nothing is lost, which is why it is the default.
 *
 * `discard` — one entry, and the losing password is NOT kept. It is the only outcome
 * here that destroys something, and it exists because somebody may not want an old
 * password stored at all; `ADR-018` §2.2 gives the same power afterwards by forgetting a
 * history, and this is the same decision taken earlier.
 *
 * `separate` — they were not the same account after all. Everything comes in as it is.
 * The identity is a heuristic, and a heuristic that does not let anybody say «you got
 * this wrong» ends up merging two different accounts on one service.
 */
export type GroupDecision = 'merge' | 'discard' | 'separate'

/** What the screen decided about a group, ready to be turned into writes. */
export interface ResolvedGroup {
  group: DuplicateGroup
  decision: GroupDecision
  /** Which entry is kept. Defaults to the group's proposal. */
  survivor?: DuplicateGroup['survivor']
}

/**
 * The writes an import comes down to, worked out before any of them happens.
 *
 * IT IS A PLAN AND NOT A LOOP THAT WRITES, which is what makes it testable at all: the
 * decisions of a screen turn into a list of creates and updates that can be asserted
 * over without a server, a mock or a rendered component.
 *
 * AND IT IS WHERE «IMPORTING ADDS» IS KEPT OR LOST. `ADR-011` §2.4 forbids an import
 * deleting anything, and nothing here deletes: the only writes are creating entries and
 * updating one that is already there with more than it had. An entry that was in the
 * vault and is not in the file is never touched.
 */
export interface ImportPlan {
  /** New entries, in the file's order. */
  create: ItemContent[]
  /** Stored entries that gain what the file brought. */
  update: { index: number; content: ItemContent }[]
  /** Secrets with nowhere to go, for the screen to say so. See `DisplacedSecret`. */
  displaced: DisplacedSecret[]
}

export function planImport(
  incoming: ItemContent[],
  existing: ItemContent[],
  resolved: ResolvedGroup[],
  sourceLabel?: string,
): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], displaced: [] }
  const spokenFor = new Set<number>()

  for (const { group, decision, survivor = group.survivor } of resolved) {
    for (const index of group.incoming) spokenFor.add(index)

    if (decision === 'separate') {
      for (const index of group.incoming) plan.create.push(incoming[index])

      continue
    }

    const members: Sourced[] = [
      ...group.existing.map((index) => ({ content: existing[index], source: 'la vault' })),
      ...group.incoming.map((index) => ({ content: incoming[index], source: sourceLabel })),
    ]
    const chosen =
      survivor.from === 'vault'
        ? members.find((one) => one.content === existing[survivor.index])
        : members.find((one) => one.content === incoming[survivor.index])
    const rest = members.filter((one) => one !== chosen)
    const merged = mergeItems(chosen as Sourced, rest)

    plan.displaced.push(...merged.displaced)

    /*
     * `discard` drops the history this merge just wrote, and only the part it wrote:
     * whatever the survivor already carried from its own rotations stays. Somebody
     * declining to store a password another manager had is not asking to forget their
     * own past.
     */
    const item =
      decision === 'discard'
        ? { ...merged.item, ...(chosen?.content.history ? { history: chosen.content.history } : {}) }
        : merged.item

    if (decision === 'discard' && !chosen?.content.history) delete item.history

    if (survivor.from === 'vault') plan.update.push({ index: survivor.index, content: item })
    else plan.create.push(item)
  }

  incoming.forEach((item, index) => {
    if (!spokenFor.has(index)) plan.create.push(item)
  })

  return plan
}

/**
 * Whether a group carries more than one password, which is what makes it a decision.
 *
 * IT IS THE LINE THE SCREEN OF #619 IS BUILT ON, and the measurement is why: over the
 * real exports there are 261 groups and only 25 where this is true (#610). In the other
 * 236 the passwords agree, so merging fills in gaps and there is nothing to choose — and
 * a screen that asked all 261 would be answered with «yes to everything» without reading.
 */
export function hasConflict(
  group: DuplicateGroup,
  incoming: ItemContent[],
  existing: ItemContent[],
): boolean {
  const passwords = [
    ...group.existing.map((index) => existing[index]),
    ...group.incoming.map((index) => incoming[index]),
  ]
    .map((one) => one.password?.trim())
    .filter(Boolean)

  return new Set(passwords).size > 1
}

/** What an import did, in the three numbers that say it. See #620. */
export interface ImportSummary {
  /** Entries the vault gained. */
  created: number
  /** Groups that came in as one entry instead of several. */
  merged: number
  /**
   * Entries left carrying more than one known password and nobody's word on which is
   * current.
   *
   * IT IS THE NUMBER THAT MAKES THE HISTORY USABLE INSTEAD OF A DRAWER, and it is the
   * answer to «vale, ¿y ahora qué reviso?». Over the real exports it is 25 of 668 — the
   * 4 % that the audit lists as its fourth finding (#622).
   */
  unresolved: number
}

/**
 * What a plan will have done, counted before it is executed.
 *
 * COUNTED FROM THE PLAN AND NOT FROM THE WRITES, so the summary cannot drift from what
 * the button said: `ADR-011` §2.4 already asks an import to say what it moved and what it
 * dropped, and this is that applied to a decision the import of that time did not take.
 */
export function summarise(plan: ImportPlan, resolved: ResolvedGroup[]): ImportSummary {
  const entries = [...plan.create, ...plan.update.map((one) => one.content)]

  return {
    created: plan.create.length,
    merged: resolved.filter(({ group, decision }) => decision !== 'separate' && group.incoming.length + group.existing.length > 1).length,
    unresolved: entries.filter((item) =>
      item.history?.some((one) => one.origin === 'import'),
    ).length,
  }
}
