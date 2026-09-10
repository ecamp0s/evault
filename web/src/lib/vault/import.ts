import { base64ToBytes, decrypt, deriveExportKey } from '@/lib/vault/crypto'
import { EXPORT_FORMAT, type ExportFile } from '@/lib/vault/export'
import { MAX_NOTES, MAX_SHORT } from '@/lib/vault/schema'
import { parseTotp } from '@/lib/vault/totp'
import type { ItemContent } from '@/lib/vault/types'

/**
 * Bringing entries into eVault from a file. See ADR-011.
 *
 * Everything happens in the client: the file is read here, decrypted here when it has
 * to be, and every entry is encrypted here before leaving. The source file NEVER
 * travels to the server, not even to «validate the format», and there is a test that
 * checks it.
 */

/** Formats this knows how to read. */
export type ImportFormat = 'evault' | 'chrome' | 'bitwarden' | 'firefox'

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
type ImportableField = 'name' | 'username' | 'password' | 'url' | 'notes' | 'totp'

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
): ItemContent | null {
  const fieldMap = FIELD_MAP[format]
  const noise = new Set(NOISE_COLUMNS[format] ?? [])
  const item: ItemContent = { name: '' }
  const extras: string[] = []

  headers.forEach((header, index) => {
    const value = (row[index] ?? '').trim()

    if (value === '') return

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

  for (const row of rows.slice(1)) {
    const item = toItem(headers, row, format, moved, dropped)

    if (item === null) {
      skipped += 1

      continue
    }

    items.push(item)
  }

  return { format, items, movedFields: [...moved], droppedFields: [...dropped], skipped }
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

  return `${host.trim().toLowerCase()}\u0000${(item.username ?? '').trim().toLowerCase()}`
}

/** Entries that look like the same account, from the file and from the vault. */
export interface DuplicateGroup {
  /** What they share. Opaque: it exists to key the group, not to be shown. */
  identity: string
  /** Positions in the incoming list, in the file's order. */
  incoming: number[]
  /** The ones already stored that fall in this group. */
  existing: ItemContent[]
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
  const groups = new Map<string, DuplicateGroup>()
  const groupFor = (identity: string) => {
    const found = groups.get(identity) ?? { identity, incoming: [], existing: [] }

    groups.set(identity, found)

    return found
  }

  for (const item of existing) {
    const identity = identityOf(item)

    if (identity) groupFor(identity).existing.push(item)
  }

  incoming.forEach((item, index) => {
    const identity = identityOf(item)

    if (identity) groupFor(identity).incoming.push(index)
  })

  return [...groups.values()].filter(
    (group) => group.incoming.length > 0 && group.incoming.length + group.existing.length > 1,
  )
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
    const survivor = group.existing.length > 0 ? undefined : group.incoming[0]

    for (const index of group.incoming) {
      if (index !== survivor) repeated.add(index)
    }
  }

  return repeated
}
