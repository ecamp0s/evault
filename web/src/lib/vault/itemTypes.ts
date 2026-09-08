import type { ItemContent } from '@/lib/vault/types'

/**
 * The three kinds of entry as the interface names them.
 *
 * THE BLOB AND THE SCREEN DISAGREE ON PURPOSE, and this module is the one place where
 * that is translated. In the blob a login has NO `tipo` at all — `ADR-020` §4 decided
 * that absence means a login, which is what keeps the 370 entries written before it out
 * of any migration. On screen there is no such thing as an absent option: somebody
 * choosing what to create is picking among three named things.
 *
 * Modelling the choice as `ItemContent['tipo']` would push that `undefined` into every
 * component, where it would have to mean «a login» by convention in each of them. One
 * conversion at the boundary is cheaper and says what it is doing.
 */
export type ItemTypeChoice = 'login' | 'tarjeta' | 'nota'

/** The order the chooser offers them in: the common case first. */
export const ITEM_TYPE_CHOICES: readonly ItemTypeChoice[] = ['login', 'tarjeta', 'nota']

/**
 * What each one is called on screen.
 *
 * «Inicio de sesión» and not «Login», because it is what the user reads and the rule is
 * that what the user reads is in Spanish. The stored value stays `tipo`, in the blob's
 * Spanish, and neither of those names may ever be swapped for the other's.
 */
export const ITEM_TYPE_LABELS: Record<ItemTypeChoice, string> = {
  login: 'Inicio de sesión',
  tarjeta: 'Tarjeta',
  nota: 'Nota',
}

/** What the dialog is called when an entry of each kind is being edited. */
export const EDIT_TITLES: Record<ItemTypeChoice, string> = {
  login: 'Editar entrada',
  tarjeta: 'Editar tarjeta',
  nota: 'Editar nota',
}

/**
 * From the choice to what gets written in the blob.
 *
 * A login writes NOTHING, which is the half that matters: returning `'login'` here would
 * add a key to every new entry saying what its absence already says, and would split the
 * vault into entries that carry the word and entries that do not — for no gain, since
 * both mean the same thing.
 */
export function toStoredType(choice: ItemTypeChoice): ItemContent['tipo'] {
  return choice === 'login' ? undefined : choice
}

/** From what is stored back to the choice. This is «absent means a login», in code. */
export function toChoice(tipo: ItemContent['tipo']): ItemTypeChoice {
  return tipo ?? 'login'
}
