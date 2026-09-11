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
  /**
   * How many entries carry each field this format does not take, deliberately.
   *
   * Zeros for the encrypted export, which takes everything. For the plaintext one it is
   * the second factor and the previous passwords, and saying the numbers is what
   * `ADR-017` §2.3 and `ADR-018` §2.3 demand: both are withheld on purpose, and «not in
   * silence» is the other half of those decisions.
   *
   * ONE NUMBER PER FIELD AND NOT ONE FOR ALL, and that is #625: while the seed was the
   * only withheld field a single count could only mean it, so the screen called it a
   * second factor. The history became the second one in #618, and from then on an entry
   * with previous passwords and no seed was announced as leaving without a second factor
   * it never had — true in its number and false in what it said.
   */
  withheld: Withheld
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

  // Zero, and not a coincidence: the encrypted file takes the whole content of each
  // item, so nothing is ever held back from it. The seed travels here (ADR-017 §2.3),
  // and so does the history with its `origin` (ADR-018 §2.3).
  return { contents: JSON.stringify(file, null, 2), unreadable, withheld: withheldCount([]) }
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
 * `favourite` (#377) and `tags` (#378) went straight past it: the CSV kept coming
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
 * `'withheld'` was carried by the type before anything used it, which was deliberate:
 * `ADR-017` had decided that a TOTP seed **never leaves in the clear**, so the answer for
 * the first field that must not travel was already written down and this is where it
 * got applied. Today two fields use it, the seed and the history.
 *
 * `SATISFIES` AND NOT A TYPE ANNOTATION, and that is #625: an annotation widens every
 * rule to `PlainExportRule` and forgets which fields are withheld, while `satisfies`
 * checks the same exhaustiveness and keeps the literals. `WithheldField` is read off
 * them, so a third withheld field is a type the export dialog has to name a sentence
 * for before it compiles.
 */
type PlainExportRule = { column: string } | 'withheld'

const PLAIN_EXPORT = {
  /*
   * The first five are Chrome's CSV headers, which is the format most managers
   * understand, and their order is the one Chrome emits.
   */
  name: { column: 'name' },
  url: { column: 'url' },
  username: { column: 'username' },
  password: { column: 'password' },
  notes: { column: 'note' },
  /*
   * These two are beyond that format, and carrying them is the lesser evil rather than
   * an obvious win: most importers ignore columns they do not know, so what this really
   * buys is that the data is IN THE FILE and can be recovered by hand — instead of
   * being dropped by us before anybody had the chance.
   *
   * `favorite` is Bitwarden's name for it. There is no standard for tags, so `tags` is
   * ours, joined with semicolons because a comma is the separator of the file itself.
   */
  favourite: { column: 'favorite' },
  tags: { column: 'tags' },
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
   * IT IS NOT DROPPED IN SILENCE, which is the other half and arrived in #420: the
   * export says how many entries carry a second factor that is not in the file,
   * because the plaintext CSV is the one used to LEAVE and the origin gets deleted after
   * it.
   */
  totp: 'withheld',
  /*
   * The card, and the type that says an entry is one.
   *
   * THESE COLUMNS ARE OURS, like `tags` and for the same reason: there is no format
   * everybody agrees on for them. `type` borrows the name Bitwarden uses for the same
   * idea, and the four card columns are prefixed so that nothing collides with a login's.
   *
   * THEY TRAVEL, AND THAT IS THE DECISION WORTH READING TWICE, because a card number in
   * a CSV in the downloads folder is plainly a secret. ADR-020 §9.2 settles it: the seed
   * above is withheld for being PERSISTENT — redoing it means reconfiguring the second
   * factor service by service, with its QR codes and its backup codes — while a card is
   * reissued in one phone call. And this file exists **to leave**: taking the passwords
   * and leaving the card behind would contradict the only reason it is generated.
   *
   * That no other manager will read these columns is not the argument against them, and
   * `favorite` and `tags` above already say why: what this buys is that the data is IN
   * THE FILE and recoverable by hand, rather than dropped by us before anybody had the
   * chance.
   */
  /*
   * THE HISTORY DOES NOT LEAVE IN THE CLEAR, and `ADR-018` §2.3 decided it before the
   * field existed, with an argument stronger than the seed's: no other manager has
   * anywhere to put a history, so the best that can happen is that it ignores the column
   * and the likely case is that it dumps it into a notes field — three old passwords in
   * plain text inside a file somebody forgets in the downloads folder.
   *
   * The `.evault` does carry it, because that is the file used to COME BACK and a copy
   * that does not restore what was there is not a copy. And the dialog says how many
   * entries leave without theirs, with a sentence of its own and not the seed's (#625).
   */
  history: 'withheld',
  type: { column: 'type' },
  cardholder: { column: 'card_holder' },
  number: { column: 'card_number' },
  expiry: { column: 'card_expiry' },
  csc: { column: 'card_code' },
  pin: { column: 'card_pin' },
} as const satisfies Record<keyof ItemContent, PlainExportRule>

type PlainField = keyof typeof PLAIN_EXPORT

/** The fields the plaintext file leaves behind, read off `PLAIN_EXPORT` and never listed. */
export type WithheldField = {
  [Field in PlainField]: (typeof PLAIN_EXPORT)[Field] extends 'withheld' ? Field : never
}[PlainField]

/** How many entries carry each withheld field. */
export type Withheld = Record<WithheldField, number>

/** The columns the plaintext file carries, in order. */
const PLAIN_COLUMNS = (Object.keys(PLAIN_EXPORT) as PlainField[]).flatMap((field) => {
  const rule: PlainExportRule = PLAIN_EXPORT[field]

  return rule === 'withheld' ? [] : [{ field, column: rule.column }]
})

/** The fields the plaintext file leaves behind, whatever they end up being. */
const WITHHELD_FIELDS = (Object.keys(PLAIN_EXPORT) as PlainField[]).filter(
  (field): field is WithheldField => PLAIN_EXPORT[field] === 'withheld',
)

/**
 * How many entries carry each thing the plaintext file is not going to take.
 *
 * COUNTED OVER `PLAIN_EXPORT` AND NOT OVER `totp`, which is the whole point: naming a
 * field here would mean the next one gets dropped in silence again — the exact failure
 * #380 came to close, one field later. The history was that next one, and it arrived
 * counted without anybody touching this function.
 *
 * It counts ENTRIES for each field, because that is the number that means something to
 * whoever is about to leave: «four of your entries have a second factor that is not in
 * this file» tells them what to go and reconfigure. And it keeps the fields apart
 * because what each one asks of them is different: a seed has to be set up again at the
 * far end, previous passwords only travel in the encrypted copy.
 */
function withheldCount(contents: ItemContent[]): Withheld {
  return Object.fromEntries(
    WITHHELD_FIELDS.map((field) => [
      field,
      contents.filter((content) => content[field] !== undefined).length,
    ]),
  ) as Withheld
}

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
    PLAIN_COLUMNS.map(({ field }) => plainCell(content, field)).join(','),
  )

  return {
    contents: [PLAIN_COLUMNS.map(({ column }) => column).join(','), ...rows].join('\n'),
    unreadable,
    withheld: withheldCount(contents),
  }
}

/**
 * How many entries would lose something by leaving in the clear, asked before exporting.
 *
 * It exists apart from `exportPlain` because the warning has to arrive BEFORE the file
 * does. The plaintext CSV is the format used to LEAVE: it gets imported at the far end,
 * the count looks right, and the origin is deleted. Finding out afterwards that the
 * second factors or the previous passwords did not travel is finding out too late.
 */
export function plainExportWouldWithhold(items: Item[]): Withheld {
  return withheldCount(readable(items).contents)
}

/**
 * How many cards would leave readable in the plaintext file, asked before exporting.
 *
 * THE COUNTERPART OF THE ONE ABOVE, AND THE REASON IT EXISTS IS THAT THE WARNING ON THAT
 * SCREEN STOPPED BEING TRUE. It promised a file holding every readable password, which
 * was the whole truth until `ADR-020`; since then it can also carry card numbers,
 * security codes and PINs, and a warning that lists less than what is in the file is the
 * kind of thing somebody reads, accepts, and only understands later.
 *
 * It counts CARDS and not fields, because that is the number that means something to
 * whoever is about to download it.
 */
export function plainExportWouldCarryCards(items: Item[]): number {
  return readable(items).contents.filter((content) => content.type === 'card').length
}
