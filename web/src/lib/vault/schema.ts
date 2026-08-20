import { z } from 'zod'
import type { ItemContent } from '@/lib/vault/types'

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
})

export type ItemFormData = z.infer<typeof itemSchema>

export const EMPTY_ITEM: ItemFormData = {
  nombre: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
}

/**
 * From the form to the content that gets stored.
 *
 * Empty fields are omitted instead of stored as an empty string: the blob's contract
 * says absent keys for whatever was not filled in, and that way the blob does not grow
 * over nothing. See docs/architecture/FOUNDATION.md.
 */
export function toContent(data: ItemFormData): ItemContent {
  const content: ItemContent = { nombre: data.nombre.trim() }

  if (data.usuario.trim()) content.usuario = data.usuario.trim()
  if (data.password) content.password = data.password
  if (data.url.trim()) content.url = data.url.trim()
  if (data.notas.trim()) content.notas = data.notas

  return content
}

/** From the stored content back to the form, for editing. */
export function toFormData(content: ItemContent): ItemFormData {
  return {
    nombre: content.nombre,
    usuario: content.usuario ?? '',
    password: content.password ?? '',
    url: content.url ?? '',
    notas: content.notas ?? '',
  }
}
