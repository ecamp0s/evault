import { z } from 'zod'
import type { ItemContent } from '@/lib/vault/types'
import { InvalidTotpSeed, parseTotp } from '@/lib/vault/totp'

/**
 * Validation of a vault entry.
 *
 * **This validation is the only one there is, and it is a real exception to the
 * project's double guard, not an oversight.** The five fields travel inside the blob,
 * so the server can neither see nor validate them: all it checks is the size of the
 * parcel. Where the pattern says «validate in the interface and validate in the
 * application too», the second half here is impossible by design. See ADR-001.
 *
 * The practical consequence: what is not checked here is checked by nobody.
 *
 * The field names stay in Spanish because they mirror the blob's, and the blob's are
 * data format and not identifiers: see the warning in types.ts. Keeping them identical
 * on both sides is what makes toContent and toFormData a trivial translation instead
 * of a mapping that has to be looked up.
 */

/*
 * The caps exist to stay well clear of the API's limit, which refuses a ciphertext of
 * more than 131072 characters. Since the blob is base64 over JSON, the real content
 * fits comfortably inside these figures.
 */
// Exported because the import needs them: what the client does not validate nobody
// validates, and a bulk import is the stress test of that exception.
export const MAX_SHORT = 500
export const MAX_NOTES = 10000

/**
 * The caps on tags.
 *
 * They are not measured from anything, unlike the two above, and saying so is the
 * point: there is no vault with tags yet to measure. They are chosen to be generous
 * enough that nobody meets them by accident and tight enough that a paste accident
 * cannot turn one entry into a wall of text — a tag is a word or two, and thirty of
 * them on one entry is already more filing than the entry can be worth.
 *
 * If somebody ever hits them, that is information and the number moves. What must not
 * happen is that they do not exist: a bulk import is their stress test, and what the
 * client does not validate nobody validates.
 */
export const MAX_TAG = 40
export const MAX_TAGS = 30

export const itemSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe un nombre').max(MAX_SHORT, 'Máximo 500 caracteres'),
  usuario: z.string().trim().max(MAX_SHORT, 'Máximo 500 caracteres'),
  password: z.string().max(MAX_SHORT, 'Máximo 500 caracteres'),
  /*
   * The URL is deliberately not validated as a URL. Almost nobody types the scheme,
   * and refusing «github.com» would mean picking a fight with the user over a field
   * that here only serves to recognise the entry at a glance. If it is ever used for
   * autofill, then it will have to be normalised.
   */
  url: z.string().trim().max(MAX_SHORT, 'Máximo 500 caracteres'),
  notas: z.string().max(MAX_NOTES, 'Máximo 10000 caracteres'),
  /*
   * The tags travel through the form as an array and not as typed text, because what
   * the user is editing is a set and not a sentence: the editor adds and removes them
   * one at a time, so there is no string to parse and no separator to argue about.
   *
   * The caps are here and not only in the editor, for the same reason the others are:
   * what the client does not validate, nobody validates. And they are caps and not
   * warnings — a vault with two hundred tags on one entry is not a vault anybody meant
   * to have.
   */
  etiquetas: z
    .array(z.string().trim().min(1).max(MAX_TAG, `Máximo ${MAX_TAG} caracteres por etiqueta`))
    .max(MAX_TAGS, `Máximo ${MAX_TAGS} etiquetas`),
  /*
   * THE SEED IS CHECKED BY READING IT, not by a regular expression over its shape, and
   * that is the point: what has to be refused is a seed that DECODES to the wrong bytes,
   * which looks exactly like one that decodes to the right ones. `parseTotp` is the same
   * code that will produce the codes, so passing here means the entry will work.
   *
   * The message comes from the error rather than being one fixed sentence, because the
   * reasons are different and each one tells the person what to do: a character that is
   * not in base32 —an O typed for a zero— is a transcription mistake to fix, and an
   * algorithm this client cannot honour is not.
   *
   * REFUSING IS THE WHOLE POINT. Saving a seed that cannot be read would produce six
   * plausible digits that no service accepts, and by then the QR code is gone.
   */
  totp: z.string().trim().superRefine((value, ctx) => {
    if (!value) return

    try {
      parseTotp(value)
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message:
          error instanceof InvalidTotpSeed
            ? error.message
            : 'Esta clave de segundo factor no se entiende',
      })
    }
  }),
})

export type ItemFormData = z.infer<typeof itemSchema>

export const EMPTY_ITEM: ItemFormData = {
  nombre: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
  etiquetas: [],
  totp: '',
}

/**
 * What the editor does with each key of the blob.
 *
 * IT IS A `Record` OVER `keyof ItemContent` SO THAT THE COMPILER ASKS, and that is the
 * whole point of it existing rather than the list being implicit in `toContent`. Adding
 * a field to `ItemContent` stops compiling until somebody says which of the two things
 * it is, exactly as `PLAIN_EXPORT` does for the plaintext export since #380.
 *
 * The alternative was already tried and it failed silently: `toContent` rebuilt the
 * content from the form's fields alone, so `favorito` —which no form field carries— was
 * dropped on every save and editing a favourite entry unstarred it. Nothing broke,
 * because there was nothing that could break (#429).
 */
type EditorRule =
  /** The form owns it: what is typed is written, and what is emptied is removed. */
  | 'edited'
  /** The form never sees it, so a save must carry it across untouched. */
  | 'preserved'

const EDITOR_FIELDS: Record<keyof ItemContent, EditorRule> = {
  nombre: 'edited',
  usuario: 'edited',
  password: 'edited',
  url: 'edited',
  notas: 'edited',
  etiquetas: 'edited',
  totp: 'edited',
  /*
   * The star is toggled from the row and never from the dialog, so the form has no
   * field for it and a save has to leave it exactly as it found it.
   */
  favorito: 'preserved',
}

/** The keys the form does not edit, which a save has to carry across. */
export const PRESERVED_FIELDS = (
  Object.entries(EDITOR_FIELDS) as [keyof ItemContent, EditorRule][]
)
  .filter(([, rule]) => rule === 'preserved')
  .map(([field]) => field)

/** The keys the form owns, which a save writes or removes. */
export const EDITED_FIELDS = (Object.entries(EDITOR_FIELDS) as [keyof ItemContent, EditorRule][])
  .filter(([, rule]) => rule === 'edited')
  .map(([field]) => field)

/**
 * From the form to the content that gets stored.
 *
 * Empty fields are omitted instead of stored as an empty string: the blob's contract
 * says absent keys for whatever was not filled in, and that way the blob does not grow
 * over nothing. See docs/architecture/FOUNDATION.md.
 *
 * IT STARTS FROM WHAT WAS STORED AND NOT FROM AN EMPTY OBJECT, which is the fix for
 * #429 and matters beyond the one field it lost. The `PUT` sends the whole content and
 * not a patch, so a key that does not travel in the write ceases to exist — silently,
 * with nothing failing. Building on top of `previous` means this client cannot destroy
 * what it does not understand, INCLUDING A KEY WRITTEN BY A NEWER CLIENT that is not in
 * `ItemContent` at all. FOUNDATION.md states that as the rule for anything that writes
 * a whole item.
 *
 * `previous` is optional because creating an entry has nothing to preserve.
 */
export function toContent(data: ItemFormData, previous?: ItemContent): ItemContent {
  const content: ItemContent = { ...previous, nombre: data.nombre.trim() }

  writeOrRemove(content, 'usuario', data.usuario.trim())
  writeOrRemove(content, 'password', data.password)
  writeOrRemove(content, 'url', data.url.trim())
  writeOrRemove(content, 'notas', data.notas.trim() ? data.notas : '')

  if (data.etiquetas.length > 0) content.etiquetas = data.etiquetas
  else delete content.etiquetas

  if (data.totp.trim()) content.totp = data.totp.trim()
  else delete content.totp

  return content
}

/**
 * Writes a text field, or removes the key when there is nothing left in it.
 *
 * Removing and not writing an empty string is the blob's contract, and doing it in one
 * place is what keeps a field from being cleared on screen and staying in the blob —
 * the failure mode that appears the moment `toContent` builds on top of what was stored
 * instead of from nothing.
 */
function writeOrRemove(
  content: ItemContent,
  field: 'usuario' | 'password' | 'url' | 'notas',
  value: string,
): void {
  if (value) content[field] = value
  else delete content[field]
}

/** From the stored content back to the form, for editing. */
export function toFormData(content: ItemContent): ItemFormData {
  return {
    nombre: content.nombre,
    usuario: content.usuario ?? '',
    password: content.password ?? '',
    url: content.url ?? '',
    notas: content.notas ?? '',
    etiquetas: content.etiquetas ?? [],
    totp: content.totp ?? '',
  }
}
