import type { CSSProperties, Ref } from 'react'
import { Copy, Globe, KeyRound, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copySecret } from '@/lib/vault/copy'
import type { Item } from '@/lib/vault/types'

interface ItemRowProps {
  item: Item
  onEdit: () => void
  onDelete: () => void
  onToggleFavourite: () => void
  /**
   * Where this row sits and how the list counts it — the four props the virtualised
   * list needs and nothing else. See ItemRows.tsx.
   *
   * `position` and `ref` are absolute positioning and measurement. `index` and `total`
   * are what a screen reader is told: with only a screenful of rows in the DOM, a list
   * of 370 entries would otherwise be announced as a list of fourteen.
   */
  position?: CSSProperties
  ref?: Ref<HTMLLIElement>
  index?: number
  total?: number
}

/**
 * One entry of the list.
 *
 * It shows name and username, and nothing else. **The password is not painted here**,
 * not even hidden behind dots: what is not in the DOM cannot be read by an extension, a
 * screenshot or a shoulder leaning over. Showing it is an explicit action of the user's,
 * and it arrives in issue #58.
 *
 * There is a test that checks the password does not appear in the list's DOM.
 *
 * The main area is a button and not a link: it opens a dialog, it does not navigate.
 * Marking it as a link would promise a URL to go to, a context menu with «open in a new
 * tab» that would lead nowhere, and a destination for a screen reader that does not
 * exist.
 *
 * The delete button is a sibling and not inside, because a button inside another button
 * is not valid HTML. It sits loose in the row and not inside a dropdown menu for a
 * practical reason: the dialog returns focus to the element that opened it, and a menu
 * item disappears when the menu closes, so the focus would be lost.
 */
export function ItemRow({
  item,
  onEdit,
  onDelete,
  onToggleFavourite,
  position,
  ref,
  index,
  total,
}: ItemRowProps) {
  const { nombre, usuario, url, password, favorito } = item.content

  return (
    /*
     * Two elements where there used to be one, and the reason is the gap between rows.
     * The list used to space them with `space-y-2` on the <ul>, which does nothing once
     * the rows are absolutely positioned; and a margin would not do either, because what
     * the virtualiser measures is the element's own height. So the <li> carries the gap
     * as padding — measured, therefore respected — and the card with its border is the
     * <div> inside.
     */
    <li
      ref={ref}
      data-index={index}
      style={position}
      aria-posinset={index === undefined ? undefined : index + 1}
      aria-setsize={total}
      className="pb-2"
    >
    <div className="flex items-center gap-1 rounded-lg border border-border pr-2 transition-colors hover:bg-muted/50">
      {/*
        * An explicit label instead of letting the accessible name come out of the
        * content. Without it, the two texts concatenate with no separation and are
        * announced as a single run-on word; the browser and jsdom also join them
        * differently, so the name depended on the environment.
        */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={usuario ? `Editar ${nombre}, ${usuario}` : `Editar ${nombre}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {url ? <Globe className="size-4" /> : <KeyRound className="size-4" />}
        </span>

        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{nombre}</span>
          {usuario ? (
            <span className="truncate text-sm text-muted-foreground">{usuario}</span>
          ) : null}
        </span>
      </button>

      {/*
        * Marking a favourite is done from the row and does not open the dialog, because
        * it is a one-bit change: making somebody open a form, tick something and save
        * would cost more than what is being decided.
        *
        * It is ALWAYS painted, marked or not, and that is a decision. Showing the star
        * only on hover would leave it out of reach on a touchscreen and would make the
        * rows measure differently depending on where the pointer is, which is exactly
        * what the virtualiser must not have to deal with.
        *
        * `aria-pressed` and not a changing label: it is the same control in two states,
        * and that is what a screen reader is told.
        */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Favorita: ${nombre}`}
        aria-pressed={Boolean(favorito)}
        onClick={onToggleFavourite}
        className={
          favorito
            ? 'shrink-0 text-amber-500 hover:text-amber-500'
            : 'shrink-0 text-muted-foreground hover:text-foreground'
        }
      >
        <Star className="size-4" aria-hidden="true" fill={favorito ? 'currentColor' : 'none'} />
      </Button>

      {/*
        * Copying is the most frequent operation of a password manager, so it lives in
        * the row and not tucked away inside the detail.
        *
        * The password is copied without ever being painted: it is in memory, in the
        * already decoded item, but it never enters the list's DOM. The button only
        * appears when there is something to copy.
        */}
      {password && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copiar la contraseña de ${nombre}`}
          onClick={() => void copySecret(password, 'Contraseña')}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-4" aria-hidden="true" />
        </Button>
      )}

      {/*
        * The label carries the entry's name. Five identical «Borrar» buttons in a list
        * say nothing to somebody navigating with a screen reader.
        */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Borrar ${nombre}`}
        onClick={onDelete}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
    </li>
  )
}
