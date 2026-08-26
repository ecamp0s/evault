import { useLayoutEffect, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Item } from '@/lib/vault/types'
import { ItemRow } from './ItemRow'

/**
 * The list of rows, painting only the ones on screen. See #349.
 *
 * WHY THIS EXISTS. The list used to paint one row per entry, all at once. With the 370
 * of the real vault that was 7.839 DOM nodes and a page 27.524 px tall, and every
 * keystroke in the search box made React reconcile hundreds of rows: 773 ms for the
 * first letter, 1.293 ms to clear it. The filtering itself was never the problem —
 * `filterItems` over 370 decrypted items is trivial — it was the DOM it produced.
 *
 * AND IT IS NOT A PROBLEM THE SERVER COULD HAVE SOLVED. Paginating `GET /items` was the
 * candidate Iteration 10 left on the table, and it was measured before being ruled out:
 * the request is 77 ms of the 2.700, and searching would still need the whole vault in
 * the client because the server cannot filter what it cannot read (ADR-001).
 *
 * THE ONE THING THAT MUST NOT HAPPEN HERE is an entry that stops being findable. This
 * component receives entries ALREADY FILTERED and only decides which of them to paint;
 * the search runs over every item in `ItemList`, upstream. Getting that backwards —
 * filtering what is painted — would hide a password without failing, without warning,
 * and the person looking for it would conclude they never saved it.
 */

/**
 * A row's height before measuring it: 66 px of card plus the 8 px gap below it.
 *
 * ROWS ARE NOT ALL THE SAME HEIGHT, measured in a browser and not assumed: an entry
 * with a username is 74 px and one without is 70. The first version of this file said
 * they were all equal — the 36 px avatar being taller than the two lines of text — and
 * that was simply wrong.
 *
 * AND IT IS DELIBERATELY THE TALLER OF THE TWO, because the two errors are not
 * symmetrical. Estimating high leaves a little slack at the bottom of a list that has
 * not been scrolled through yet; estimating low makes the page shorter than its
 * contents, and **the last entry cannot be reached**. Measured with an estimate of 68:
 * the final row sat 46 px below the bottom of the window, unreachable at full scroll.
 *
 * Every row is measured once it is on screen, so this number only decides the ones
 * nobody has looked at yet.
 */
const ESTIMATED_ROW = 74

/**
 * Rows painted beyond each edge of the window.
 *
 * Enough that ordinary scrolling never reaches the edge of what is painted, and few
 * enough that the DOM does not grow back. It also covers what a keyboard does: tabbing
 * moves focus one row at a time and focus must not land on something that is not there.
 */
const OVERSCAN = 8

interface ItemRowsProps {
  items: Item[]
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
}

export function ItemRows({ items, onEdit, onDelete }: ItemRowsProps) {
  const list = useRef<HTMLUListElement>(null)

  /**
   * How far down the page the list starts — the toolbar and the search box above it.
   *
   * IN STATE AND NOT READ FROM THE REF DURING RENDER, and the difference is not
   * stylistic. The first version did `list.current?.offsetTop ?? 0` inline; the lint
   * rule that forbids reading a ref while rendering caught it, and it was right about
   * more than it claimed: on the first render the ref is still null, so the margin was
   * born as 0 and **nothing ever recomputed it**. The virtualiser would have believed
   * the list starts at the top of the document for as long as the screen lived, and
   * painted the rows of a scroll position that is not the one the person is at — which
   * is exactly what the margin exists to prevent.
   *
   * Remeasured on resize because the toolbar above wraps onto a second line when the
   * window is narrow, and the list starts lower down when it does.
   */
  const [listTop, setListTop] = useState(0)

  useLayoutEffect(() => {
    const node = list.current

    if (!node) {
      return
    }

    const measure = () => setListTop(node.offsetTop)

    measure()
    window.addEventListener('resize', measure)

    return () => window.removeEventListener('resize', measure)
  }, [])

  /*
   * The window scrolls, not a box inside the page.
   *
   * It keeps the page behaving like a page — one scrollbar, the browser's own scroll
   * restoration, and the mobile gesture that hides the address bar. Whether the list
   * should get its own scrolling frame instead is #351's decision, and it is a layout
   * decision rather than a performance one: with this in place, the DOM no longer grows
   * either way.
   */
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATED_ROW,
    overscan: OVERSCAN,
    scrollMargin: listTop,
    /*
     * Keyed by the entry's id and not by its position. On a list that is filtered as
     * somebody types, position is the one thing that does change.
     */
    getItemKey: (index) => items[index].id,
  })

  return (
    <ul
      ref={list}
      aria-label="Credenciales guardadas"
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <ItemRow
          key={row.key}
          ref={virtualizer.measureElement}
          index={row.index}
          total={items.length}
          position={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
          }}
          item={items[row.index]}
          onEdit={() => onEdit(items[row.index])}
          onDelete={() => onDelete(items[row.index])}
        />
      ))}
    </ul>
  )
}
