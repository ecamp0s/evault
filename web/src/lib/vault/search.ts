import type { Item } from '@/lib/vault/types'

/**
 * Searching items, in the client and only in the client.
 *
 * Not a simplification, and not a first version to be improved later: **the server
 * cannot filter what it cannot read**. The items arrive encrypted and are decrypted in
 * memory, so the only place in the system where there is anything to search is this
 * one. It is in ADR-001 as an accepted consequence and in FOUNDATION.md among the
 * consequences for whoever writes code.
 *
 * It is worth saying here, and not only in the documentation: somebody arriving later
 * and seeing a client-side filter will think of moving it to the server with the best
 * of intentions, and they should be spared the trip. Moving this to the server would
 * mean sending it the content in the clear — that is, no longer being a zero-knowledge
 * product.
 */

/**
 * Lowercases a text and strips its diacritical marks.
 *
 * Searching for «cafe» has to find «Café». NFD decomposition separates the letter from
 * its accent and the replacement takes the accent away, which is the standard way of
 * doing it without keeping a table of equivalences by hand.
 *
 * **The Spanish n-with-tilde loses its tilde too**, and that is a decision and not an
 * oversight. In Spanish it is a letter in its own right, so the correct thing when
 * sorting or comparing would be to keep it; but this is a search, and here the
 * priorities invert. Somebody typing «espanol» — on a keyboard without that key, or in
 * a hurry — expects to find «Español», and not finding it looks like the entry does
 * not exist. The price is that «ano» also finds «año»: one result too many, dismissed
 * at a glance.
 *
 * The underlying rule: in a search, a false positive annoys and a false negative
 * hides. When in doubt, permissive.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * The fields that are searched.
 *
 * The password is **not** among them, deliberately: searching by it would mean typing
 * a secret into a field shown in the clear, which also ends up in the form's history.
 * The notes are, because that is where «the work account» ends up — the thing that
 * tells two entries of the same service apart.
 */
function searchableText(item: Item): string {
  const { nombre, usuario, url, notas } = item.content

  return [nombre, usuario, url, notas].filter(Boolean).join(' ')
}

/**
 * Filters the items that match what was typed.
 *
 * Every word has to appear, in any field and in any order: whoever types «github ada»
 * expects Ada's GitHub entry, not every entry containing one thing or the other. It is
 * what tells a useful search apart from one that returns half the vault.
 */
export function filterItems(items: Item[], query: string): Item[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)

  if (terms.length === 0) {
    return items
  }

  return items.filter((item) => {
    const text = normalize(searchableText(item))

    return terms.every((term) => text.includes(term))
  })
}
