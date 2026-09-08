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

/**
 * The cap on a card's short fields: the number, the expiry, the security code and the
 * PIN.
 *
 * ONE CAP FOR THE FOUR, AND THAT IS THE POINT RATHER THAN A SHORTCUT. `ADR-020` §6
 * decided that a card is bounded by size and never checked for shape, because every
 * shape rule is a guess about the brands we happen to have seen — an American Express
 * number has FIFTEEN digits and not sixteen, its security code is FOUR and not three,
 * and there are issuers handing out PINs of five and six. Giving each field its own
 * number would smuggle those same guesses back in wearing a different hat: a cap of 4
 * on `csc` is the three-digit assumption, only spelled as a length.
 *
 * NOT MEASURED, CHOSEN, exactly like the tag caps above and said out loud for the same
 * reason: there is no vault with cards in it to measure yet. Forty is far above the
 * longest thing that legitimately goes in any of them — the longest card number the
 * standard allows is nineteen digits, twenty-four with separators — and far below what
 * turns one entry into a wall of text after a paste accident.
 *
 * WHAT MOVES IT is somebody hitting it with a real card. That is information, and the
 * number changes. What must not happen is that it does not exist: a bulk import is its
 * stress test, and what the client does not validate nobody validates.
 */
export const MAX_CARD_FIELD = 40

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
  /*
   * The five fields of a card, capped and never matched against a pattern. See
   * `ADR-020` §6 and the comment on MAX_CARD_FIELD.
   *
   * THE REPOSITORY ALREADY DECIDED WHICH OF ITS TWO PHILOSOPHIES APPLIES HERE. The URL
   * above is deliberately not validated as a URL, because refusing «github.com» would
   * mean picking a fight with the user. The seed below IS validated hard, because a seed
   * that cannot be read produces six plausible digits no service accepts and by then the
   * QR code is gone. A card is the first case: if the number is wrong, the card is still
   * on the table and gets looked at again — there is no moment equivalent to «the QR is
   * gone».
   *
   * They are trimmed, unlike `password`, and the difference is not an oversight: a space
   * at the end of a password can be part of the password, while a space at the end of a
   * card number is a paste that took one character too many.
   *
   * `titular` gets MAX_SHORT and not the card cap, because it is a person's name and
   * belongs with `usuario` rather than with the four short ones.
   */
  titular: z.string().trim().max(MAX_SHORT, 'Máximo 500 caracteres'),
  numero: z.string().trim().max(MAX_CARD_FIELD, `Máximo ${MAX_CARD_FIELD} caracteres`),
  caducidad: z.string().trim().max(MAX_CARD_FIELD, `Máximo ${MAX_CARD_FIELD} caracteres`),
  csc: z.string().trim().max(MAX_CARD_FIELD, `Máximo ${MAX_CARD_FIELD} caracteres`),
  pin: z.string().trim().max(MAX_CARD_FIELD, `Máximo ${MAX_CARD_FIELD} caracteres`),
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
  titular: '',
  numero: '',
  caducidad: '',
  csc: '',
  pin: '',
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
  /*
   * `PRESERVED` AND NOT `EDITED`, AND IT IS THE ANSWER ADR-020 §4 DECIDED: the type is
   * fixed when the entry is created and never changed afterwards, so editing must carry
   * it across exactly as it was found.
   *
   * Letting the form own it would not just allow an unwanted change, it would allow a
   * silent one: `toContent` builds on top of what was stored, so turning a login into a
   * card would leave its password inside the card, invisible and still there. That is
   * #429 with the sign flipped — instead of losing a field nobody edits, keeping one
   * nobody can see.
   *
   * Being `preserved` also means the star's test covers it for free: the loop over
   * PRESERVED_FIELDS is what fails if a save ever drops it.
   */
  tipo: 'preserved',
  /*
   * The five fields of a card. The form owns them exactly like the login's five: what is
   * typed is written and what is emptied is removed.
   *
   * They are `edited` even though no form carries them yet — the editor gains them in
   * #505 and #506 — because this Record answers what the SAVE must do with each key, and
   * that answer does not depend on which screen is built first. Marking them
   * `preserved` to match today's editor would be describing the schedule instead of the
   * contract, and it would quietly become permanent.
   */
  titular: 'edited',
  numero: 'edited',
  caducidad: 'edited',
  csc: 'edited',
  pin: 'edited',
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
export function toContent(
  data: ItemFormData,
  previous?: ItemContent,
  typeWhenCreating?: ItemContent['tipo'],
): ItemContent {
  const content: ItemContent = { ...previous, nombre: data.nombre.trim() }

  /*
   * THE TYPE IS SET ONCE, WHEN THE ENTRY IS CREATED, AND THAT IS THE WHOLE GUARANTEE OF
   * ADR-020 §4 EXPRESSED IN TWO LINES.
   *
   * When there is a `previous` this is an edit, so the type comes from what was stored —
   * it arrived with the spread above — and `typeWhenCreating` does not get a say. A
   * caller passing both is not obeyed rather than corrected, because the alternative to
   * ignoring it is throwing inside a save, and losing somebody's typing to enforce an
   * invariant is a worse trade than declining to act on it.
   *
   * What makes changing the type dangerous rather than merely unwanted is that the
   * change would be SILENT: `content` is built on top of what was stored, so turning a
   * login into a card would leave its password inside the card — invisible on every
   * screen and still there in the blob. That is #429 with the sign flipped.
   */
  if (!previous && typeWhenCreating) content.tipo = typeWhenCreating

  writeOrRemove(content, 'usuario', data.usuario.trim())
  writeOrRemove(content, 'password', data.password)
  writeOrRemove(content, 'url', data.url.trim())
  writeOrRemove(content, 'notas', data.notas.trim() ? data.notas : '')
  /*
   * The card's five, trimmed. `titular` goes with the four short ones here even though
   * its cap is different, because what this function cares about is that a field emptied
   * on screen disappears from the blob, and that is the same for all five.
   */
  writeOrRemove(content, 'titular', data.titular.trim())
  writeOrRemove(content, 'numero', data.numero.trim())
  writeOrRemove(content, 'caducidad', data.caducidad.trim())
  writeOrRemove(content, 'csc', data.csc.trim())
  writeOrRemove(content, 'pin', data.pin.trim())

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
  field: 'usuario' | 'password' | 'url' | 'notas' | 'titular' | 'numero' | 'caducidad' | 'csc' | 'pin',
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
    titular: content.titular ?? '',
    numero: content.numero ?? '',
    caducidad: content.caducidad ?? '',
    csc: content.csc ?? '',
    pin: content.pin ?? '',
  }
}
