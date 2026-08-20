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
export type ImportFormat = 'evault' | 'chrome' | 'bitwarden'

/** What has been understood from the file, before anything is written. */
export interface ImportPreview {
  format: ImportFormat
  items: ItemContent[]
  /** Fields that do not fit the schema and have been kept in the notes. */
  movedFields: string[]
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

/** The columns each program is recognised by. */
const HEADERS: Record<Exclude<ImportFormat, 'evault'>, string[]> = {
  chrome: ['name', 'url', 'username', 'password'],
  bitwarden: ['name', 'login_username', 'login_password'],
}

/** Which column goes to which field of the item. The rest is kept in the notes. */
const FIELD_MAP: Record<Exclude<ImportFormat, 'evault'>, Record<string, keyof ItemContent>> = {
  chrome: { name: 'nombre', url: 'url', username: 'usuario', password: 'password', note: 'notas' },
  bitwarden: {
    name: 'nombre',
    login_uri: 'url',
    login_username: 'usuario',
    login_password: 'password',
    notes: 'notas',
  },
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
): ItemContent | null {
  const fieldMap = FIELD_MAP[format]
  const item: ItemContent = { nombre: '' }
  const extras: string[] = []

  headers.forEach((header, index) => {
    const value = (row[index] ?? '').trim()

    if (value === '') return

    const target = fieldMap[header]

    if (target) {
      item[target] = value

      return
    }

    extras.push(`${header}: ${value}`)
    moved.add(header)
  })

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

      return { format: 'evault', items: decrypted.items, movedFields: [], skipped: 0 }
    } catch {
      // With AES-GCM, a wrong passphrase and a tampered file are indistinguishable:
      // both fail the authentication tag.
      throw new ImportError('passphrase-incorrecta')
    }
  }

  const rows = parseCsv(trimmed)

  if (rows.length < 2) throw new ImportError('fichero-vacio')

  const headers = rows[0].map((c) => c.trim().toLowerCase())

  const format = (Object.keys(HEADERS) as Exclude<ImportFormat, 'evault'>[]).find((candidate) =>
    HEADERS[candidate].every((column) => headers.includes(column)),
  )

  if (!format) throw new ImportError('formato-desconocido')

  const moved = new Set<string>()
  const items: ItemContent[] = []
  let skipped = 0

  for (const row of rows.slice(1)) {
    const item = toItem(headers, row, format, moved)

    if (item === null) {
      skipped += 1

      continue
    }

    items.push(item)
  }

  return { format, items, movedFields: [...moved], skipped }
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
