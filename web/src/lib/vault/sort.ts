import type { Item } from '@/lib/vault/types'

/**
 * The order the list is painted in, in the client and only in the client.
 *
 * Like the search, and for the same reason: **the server cannot sort what it cannot
 * read**. `ListVaultItems` orders by `created_at` because that is the only column with
 * any meaning in it — the name lives inside the encrypted blob, and `ADR-001` is why
 * there is no column carrying it. So sorting happens here, after decrypting, or it
 * does not happen at all.
 *
 * Worth saying in the code and not only in the documentation: whoever arrives later and
 * finds the client sorting a list will think of pushing it down to the server. They
 * should be spared the trip — it would mean sending the names in the clear.
 *
 * WHY THIS EXISTS AT ALL: until #376 nothing sorted. The list arrived in `created_at`
 * order and was painted as it came, so a vault of 370 entries imported in one go showed
 * up **in the order of the file they came from**. Nobody noticed because the list's
 * tests mount three items, and with three items any order looks like an order.
 */

export type SortOrder = 'nombre' | 'recientes' | 'modificados'

export const DEFAULT_SORT_ORDER: SortOrder = 'nombre'

/** What the user reads for each order. */
export const SORT_LABELS: Record<SortOrder, string> = {
  nombre: 'Nombre',
  recientes: 'Añadida hace menos',
  modificados: 'Modificada hace menos',
}

/**
 * The comparator for names.
 *
 * THE N-WITH-TILDE GOES THE OTHER WAY HERE THAN IN THE SEARCH, and that is deliberate,
 * not an oversight of one of the two. `search.ts` strips its tilde on purpose, so that
 * typing «espanol» finds «Español»: in a search a false positive is a nuisance and a
 * false negative hides. Sorting inverts the priority — in Spanish it is a letter of its
 * own and belongs between the n and the o, and a list that files «Ñandú» among the Ns
 * looks broken to whoever is scanning it.
 *
 * `Intl.Collator` does that by itself with the `es` locale, and it was **measured
 * rather than assumed**: at `sensitivity: 'base'` it still puts n before the
 * n-with-tilde before o, because in the Spanish collation it is a primary letter and
 * not an n with a mark on it. So `normalize()` from `search.ts` must NOT be reused
 * here — that is the obvious mistake, and it would file it back among the Ns.
 *
 * The letter is spelled out rather than typed, and that is not squeamishness: a bare
 * one is a strong Spanish signal for `check-comment-language.py`, which would read this
 * English paragraph as prose left untranslated. `search.ts` spells it out for the same
 * reason.
 *
 * `sensitivity: 'base'` also makes «gmail» and «Gmail» equal, which is what somebody
 * scanning a list expects. Ties keep the order they arrived in, because
 * `Array.prototype.sort` is stable.
 *
 * `numeric: true` puts «Servidor 2» before «Servidor 10», which is the whole reason the
 * option exists.
 */
const byName = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

/**
 * Newest first, with whatever has no date last.
 *
 * The dates are the server's and are ISO 8601 strings, so comparing them as text
 * already orders them. They are nullable in the contract, and something with no date
 * cannot claim to be recent.
 */
function byDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1

  return a < b ? 1 : -1
}

/**
 * Sorts a copy and never the original.
 *
 * The array it receives belongs to the query cache, and `sort` mutates in place: doing
 * it without copying would reorder what React Query holds, behind its back and without
 * a re-render to show for it.
 */
function comparator(order: SortOrder): (a: Item, b: Item) => number {
  switch (order) {
    case 'recientes':
      return (a, b) => byDateDesc(a.createdAt, b.createdAt)
    case 'modificados':
      return (a, b) => byDateDesc(a.updatedAt, b.updatedAt)
    default:
      return (a, b) => byName.compare(a.content.nombre, b.content.nombre)
  }
}

/**
 * Favourites first, and the chosen order inside each group.
 *
 * THE FAVOURITES DO NOT REPLACE THE ORDER, THEY SIT ON TOP OF IT (#377). Somebody with
 * 370 entries marks perhaps ten, and those ten still have to be findable among
 * themselves — a handful of favourites in an order nobody can name is the same problem
 * this list had with all 370 of them.
 *
 * It is not a separate section with a heading either: they are the same list, and a
 * search filters across both. Splitting them would mean deciding what a search does
 * with a favourite that does not match, which is a question nobody needs answered.
 */
export function sortItems(items: Item[], order: SortOrder): Item[] {
  const within = comparator(order)

  return [...items].sort((a, b) => {
    const favourites = Number(b.content.favorito ?? false) - Number(a.content.favorito ?? false)

    return favourites || within(a, b)
  })
}
