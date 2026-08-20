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
 * The plaintext format, for leaving towards another manager.
 *
 * It exists despite the risk because without it the user is trapped in eVault, and a
 * manager that will not let you leave is worse than one that will not let you in. The
 * headers are those of Chrome's CSV, which is the one most places understand.
 *
 * The caller has to have confirmed beforehand what is being created: a file with every
 * password in it readable.
 */
export function exportPlain(items: Item[]): ExportResult {
  const { contents, unreadable } = readable(items)

  const rows = contents.map((content) =>
    [
      csvValue(content.nombre),
      csvValue(content.url),
      csvValue(content.usuario),
      csvValue(content.password),
      csvValue(content.notas),
    ].join(','),
  )

  return {
    contents: ['name,url,username,password,note', ...rows].join('\n'),
    unreadable,
  }
}
