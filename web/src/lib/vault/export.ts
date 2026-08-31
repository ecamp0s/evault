import {
  EXPORT_ITERATIONS,
  EXPORT_SALT_BYTES,
  bytesToBase64,
  deriveExportKey,
  encrypt,
  randomBytes,
} from '@/lib/vault/crypto'
import { isUnreadable } from '@/lib/vault/payload'
import type { Item, ItemContent } from '@/lib/vault/types'

/**
 * Taking the vault out of eVault. See ADR-011.
 *
 * Everything happens here, in the client, and not out of elegance: the server cannot
 * read the items, so there is no export endpoint and there cannot be one. It is worth
 * saying in the interface, because it demonstrates the model more convincingly than
 * any explanation.
 */

/** Version of the native format. Checked when importing. */
export const EXPORT_FORMAT = 'evault-export'
export const EXPORT_VERSION = 1

/**
 * The plaintext header of an encrypted file.
 *
 * Self-describing on purpose: whoever opens it three versions from now has to be able
 * to tell how it was encrypted without guessing. And it carries NO item count, no
 * date, no email and no vault name: those are metadata a stolen file would hand over
 * for free, and the project already refused to keep counters on the server for the
 * same reason.
 */
export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: number
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-256-GCM'; iv: string }
  ciphertext: string
}

/** What whoever exports takes away, plus what they have to be told. */
export interface ExportResult {
  contents: string
  /** How many items could not be read and are left out. */
  unreadable: number
}

/**
 * The items that can be read, and how many cannot.
 *
 * An item that does not decrypt does NOT abort the export, and that is deliberate:
 * whoever has a broken entry is exactly who most needs a copy of the rest. What cannot
 * be done is writing an incomplete file without saying so, so they are counted and the
 * caller takes care of saying it.
 */
function readable(items: Item[]): { contents: ItemContent[]; unreadable: number } {
  const contents: ItemContent[] = []
  let unreadable = 0

  for (const item of items) {
    if (isUnreadable(item.content)) {
      unreadable += 1

      continue
    }

    contents.push(item.content)
  }

  return { contents, unreadable }
}

/**
 * The encrypted format, which is the default one.
 *
 * The passphrase is different from the master password on purpose, and it is not a
 * gratuitous nuisance: the copy has to be of use on the day that very password has
 * been lost, which is the day anyone goes looking for the backup. See ADR-011.
 */
export async function exportEncrypted(
  items: Item[],
  passphrase: string,
): Promise<ExportResult> {
  const { contents, unreadable } = readable(items)

  const salt = randomBytes(EXPORT_SALT_BYTES)
  const key = await deriveExportKey(passphrase, salt, EXPORT_ITERATIONS)
  const { data, iv } = await encrypt(key, JSON.stringify({ items: contents }))

  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: EXPORT_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-256-GCM', iv },
    ciphertext: data,
  }

  return { contents: JSON.stringify(file, null, 2), unreadable }
}

/** Escapes a value for CSV: doubled quotes and the field wrapped in quotes. */
function csvValue(value: string | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`
}

/**
 * What the plaintext export does with each field of the blob.
 *
 * THIS TYPE IS THE POINT OF #380, AND IT IS NOT DOCUMENTATION: it is a `Record` over
 * `keyof ItemContent`, so **the day the blob gains a field this file stops compiling**
 * until somebody decides what happens to it. That is the half that matters, because
 * the failure being closed here is not «the export is wrong» but «the export went on
 * being right about a list that had changed».
 *
 * It had already happened, silently. `exportPlain` listed the five fields by hand, and
 * `favorito` (#377) and `etiquetas` (#378) went straight past it: the CSV kept coming
 * out perfectly formed and two fields short. Nothing failed, because there was nothing
 * that could fail.
 *
 * IT IS EXACTLY WHAT `ADR-011` §2.4 FORBIDS, on the way out instead of the way in.
 * About importing, that section says what does not fit is kept and its count reported,
 * and calls dropping it quietly the worst way the feature can fail — because the user
 * reads «imported», deletes the source, and finds out months later.
 *
 * Swap importing for exporting and the argument still holds, only harder: the plaintext
 * file is the one used **to leave**, so it gets imported at the far end, the count looks
 * right, and the origin is deleted.
 *
 * `'withheld'` is not used today and the type carries it anyway, which is deliberate:
 * `ADR-017` decided that a TOTP seed **never leaves in the clear**, so the answer for
 * the first field that must not travel is already written down and this is where it
 * gets applied. The notice that counts withheld fields arrives with that field, not
 * before — building it now would ship a branch nothing exercises.
 */
type PlainExportRule = { column: string } | 'withheld'

const PLAIN_EXPORT: Record<keyof ItemContent, PlainExportRule> = {
  /*
   * The first five are Chrome's CSV headers, which is the format most managers
   * understand, and their order is the one Chrome emits.
   */
  nombre: { column: 'name' },
  url: { column: 'url' },
  usuario: { column: 'username' },
  password: { column: 'password' },
  notas: { column: 'note' },
  /*
   * These two are beyond that format, and carrying them is the lesser evil rather than
   * an obvious win: most importers ignore columns they do not know, so what this really
   * buys is that the data is IN THE FILE and can be recovered by hand — instead of
   * being dropped by us before anybody had the chance.
   *
   * `favorite` is Bitwarden's name for it. There is no standard for tags, so `tags` is
   * ours, joined with semicolons because a comma is the separator of the file itself.
   */
  favorito: { column: 'favorite' },
  etiquetas: { column: 'tags' },
  /*
   * THE SEED NEVER LEAVES IN THE CLEAR, decided in ADR-017 §2.3 and applied here, which
   * is the first use of `'withheld'` since #380 built the type to carry it.
   *
   * A password in a CSV is a secret in the downloads folder; a TOTP seed is one too AND
   * IT IS PERSISTENT — a password is rotated in five minutes, a seed means reconfiguring
   * the second factor account by account, with its QR code and its backup codes. And
   * carrying it would buy little: the CSVs other managers import do not agree on what to
   * call that column.
   *
   * IT IS NOT DROPPED IN SILENCE, which is the other half and is NOT here yet: the
   * export has to say how many entries carry a second factor that is not in the file,
   * because the plaintext CSV is the one used to LEAVE and the origin gets deleted after
   * it. That notice is #420.
   */
  totp: 'withheld',
}

/** The columns the plaintext file carries, in order. */
const PLAIN_COLUMNS = Object.entries(PLAIN_EXPORT).filter(
  (entry): entry is [keyof ItemContent, { column: string }] => entry[1] !== 'withheld',
)

/** How one field is written into a cell. */
function plainCell(content: ItemContent, field: keyof ItemContent): string {
  const value = content[field]

  if (value === undefined) return csvValue('')
  if (value === true) return csvValue('true')
  if (Array.isArray(value)) return csvValue(value.join(';'))

  return csvValue(value)
}

/**
 * The plaintext format, for leaving towards another manager.
 *
 * It exists despite the risk because without it the user is trapped in eVault, and a
 * manager that will not let you leave is worse than one that will not let you in. The
 * headers are those of Chrome's CSV, which is the one most places understand, plus what
 * `PLAIN_EXPORT` adds beyond it.
 *
 * The caller has to have confirmed beforehand what is being created: a file with every
 * password in it readable.
 */
export function exportPlain(items: Item[]): ExportResult {
  const { contents, unreadable } = readable(items)

  const rows = contents.map((content) =>
    PLAIN_COLUMNS.map(([field]) => plainCell(content, field)).join(','),
  )

  return {
    contents: [PLAIN_COLUMNS.map(([, rule]) => rule.column).join(','), ...rows].join('\n'),
    unreadable,
  }
}
