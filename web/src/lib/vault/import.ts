import { base64ToBytes, decrypt, deriveExportKey } from '@/lib/vault/crypto'
import { EXPORT_FORMAT, type ExportFile } from '@/lib/vault/export'
import { MAX_NOTES, MAX_SHORT } from '@/lib/vault/schema'
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

/**
 * The columns each program is recognised by.
 *
 * `absent` IS NOT DECORATION, and #381 is why. Firefox's file has `url`, `username` and
 * `password` and no `name` at all, so its signature is a subset of Chrome's: a Chrome
 * file matches it too. Without saying which column must NOT be there, which format wins
 * would depend on the order of these keys — a correctness bug hiding in an object
 * literal, invisible to every test that only feeds one file at a time.
 */
const HEADERS: Record<Exclude<ImportFormat, 'evault'>, { required: string[]; absent?: string[] }> =
  {
    chrome: { required: ['name', 'url', 'username', 'password'] },
    bitwarden: { required: ['name', 'login_username', 'login_password'] },
    firefox: { required: ['url', 'username', 'password'], absent: ['name'] },
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
 * NOT `keyof ItemContent`, and #377 is why: `favorito` is `true | undefined`, so a map
 * pointing at it would let a column be assigned a string where only `true` fits. It
 * used to type-check because every field was a string; it stopped the day the blob
 * gained one that is not.
 *
 * Listing them also says something true: **what an import can fill in is the text of an
 * entry**, and nothing else. A CSV does not carry favourites.
 */
type ImportableField = 'nombre' | 'usuario' | 'password' | 'url' | 'notas'

/** Which column goes to which field of the item. The rest is kept in the notes. */
const FIELD_MAP: Record<Exclude<ImportFormat, 'evault'>, Record<string, ImportableField>> = {
  chrome: { name: 'nombre', url: 'url', username: 'usuario', password: 'password', note: 'notas' },
  bitwarden: {
    name: 'nombre',
    login_uri: 'url',
    login_username: 'usuario',
    login_password: 'password',
    notes: 'notas',
  },
  /*
   * No `name`, because Firefox's file has no such column: it identifies a credential by
   * its URL. The name is derived in `nameFromUrl` below.
   */
  firefox: { url: 'url', username: 'usuario', password: 'password' },
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
  const item: ItemContent = { nombre: '' }
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
  if (!item.nombre && !Object.values(fieldMap).includes('nombre')) {
    item.nombre = nameFromUrl(item.url ?? '')
  }

  if (!item.nombre) return null

  if (extras.length > 0) {
    const extrasHeader = 'Importado de otro gestor:'
    item.notas = [item.notas, extrasHeader, ...extras].filter(Boolean).join('\n')
  }

  // The schema's caps apply all the same: what the client does not validate nobody
  // validates, and a bulk import is its stress test.
  item.nombre = truncate(item.nombre, MAX_SHORT)
  if (item.usuario) item.usuario = truncate(item.usuario, MAX_SHORT)
  if (item.password) item.password = truncate(item.password, MAX_SHORT)
  if (item.url) item.url = truncate(item.url, MAX_SHORT)
  if (item.notas) item.notas = truncate(item.notas, MAX_NOTES)

  return item
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

  const format = (Object.keys(HEADERS) as Exclude<ImportFormat, 'evault'>[]).find((candidate) => {
    const { required, absent = [] } = HEADERS[candidate]

    return (
      required.every((column) => headers.includes(column)) &&
      absent.every((column) => !headers.includes(column))
    )
  })

  if (!format) throw new ImportError('formato-desconocido')

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
 * Which of the incoming ones look to be in the vault already.
 *
 * It warns; it does not decide. There is no stable identifier across two instances, so
 * «the same item» can only be a heuristic over name and username, and a heuristic that
 * errs towards merging loses data in silence. ADR-011 decided that importing always
 * adds and that this exists so the user can untick.
 */
export function findDuplicates(incoming: ItemContent[], existing: ItemContent[]): Set<number> {
  const keyOf = (item: ItemContent) => `${item.nombre.trim()}\0${(item.usuario ?? '').trim()}`
  const existingKeys = new Set(existing.map(keyOf))

  return new Set(
    incoming.reduce<number[]>(
      (acc, item, index) => (existingKeys.has(keyOf(item)) ? [...acc, index] : acc),
      [],
    ),
  )
}
