import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { tagKey, type TagCount } from '@/lib/vault/tags'

/**
 * How many chips are painted before the rest are folded away.
 *
 * THE NUMBER IS CHOSEN AND NOT MEASURED, and that is said rather than dressed up: there
 * is no vault with tags yet to measure. What it is chosen against is the row itself —
 * beyond a dozen the chips wrap into a block that pushes the list off the screen, and a
 * filter that hides what it filters is worse than no filter.
 *
 * #379 asked for this to be decided BEFORE a vault has fifty tags rather than after,
 * because the shape of the answer changes the component and not just a constant.
 */
const CHIPS_SHOWN = 12

interface TagFilterProps {
  tags: TagCount[]
  selected: string | null
  onSelect: (tag: string | null) => void
}

/**
 * The vault's tags, above the list, to filter by one of them.
 *
 * ONE TAG AND NOT SEVERAL, and it is a decision rather than a first version. Two tags
 * at once immediately raise whether they mean AND or OR, and neither answer is obviously
 * right — which is a question nobody has yet needed answered. Meanwhile one tag PLUS
 * the search box already gives an intersection, which is the case that comes up.
 *
 * It is not persisted, unlike the sort order: an order is a preference and a filter is
 * something being done right now. Coming back tomorrow to a vault that silently shows
 * four of 370 entries is the way this frightens people.
 */
export function TagFilter({ tags, selected, onSelect }: TagFilterProps) {
  const [expanded, setExpanded] = useState(false)

  if (tags.length === 0) return null

  const folded = !expanded && tags.length > CHIPS_SHOWN
  const shown = folded ? tags.slice(0, CHIPS_SHOWN) : tags

  return (
    /*
     * `mb-3` SEPARATES THE ROW OF CHIPS FROM THE LIST, and it belongs here and not in the
     * container because this component returns `null` when there are no tags: a margin on
     * the container would leave a hole in every vault that has not tagged anything yet.
     *
     * Without it the chips sit flush against the first entry —measured at 0px, against
     * the 8px between one card and the next— and on a phone that reads as the two
     * overlapping. Found using the real vault from an iPhone (#439); no test can see the
     * gap itself, because jsdom applies no CSS and does no layout.
     */
    <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Filtrar por etiqueta">
      {shown.map(({ tag, count }) => {
        const active = selected !== null && tagKey(selected) === tagKey(tag)

        return (
          <Button
            key={tagKey(tag)}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            /*
             * An explicit name instead of letting it come out of the two texts, which is
             * the same trap `ItemRow` documents: with no separation between them a
             * screen reader announces «trabajo2» as one run-on word, and the browser and
             * jsdom join them differently, so the name would depend on the environment.
             */
            aria-label={count === 1 ? `${tag}, 1 entrada` : `${tag}, ${count} entradas`}
            className="h-6 rounded-full px-2.5 text-xs font-normal"
            onClick={() => onSelect(active ? null : tag)}
          >
            {tag}
            <span className={active ? 'opacity-80' : 'text-muted-foreground'}>{count}</span>
          </Button>
        )
      })}

      {folded && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 rounded-full px-2.5 text-xs font-normal text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          {`Ver ${tags.length - CHIPS_SHOWN} más`}
        </Button>
      )}

      {/*
        * The way out is its own control and not only «click the lit chip again».
        *
        * With the row folded, the chosen tag may not even be painted — it can be the
        * fortieth — so without this there would be no visible way back to the whole
        * vault. A list of 370 showing four with no evident reason is exactly how this
        * frightens somebody.
        */}
      {selected !== null && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 rounded-full px-2.5 text-xs font-normal"
          onClick={() => onSelect(null)}
        >
          <X className="size-3" aria-hidden="true" />
          Quitar el filtro
        </Button>
      )}
    </div>
  )
}
