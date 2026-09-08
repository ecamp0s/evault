import type { CSSProperties, Ref } from 'react'
import { CreditCard, Copy, Globe, KeyRound, Star, StickyNote, Trash2 } from 'lucide-react'
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
 *
 * THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN AND IS TRUE NOW (#360). No dialog returned
 * the focus anywhere — every one of them is mounted rather than opened by a trigger, so
 * closing left it on `document.body`. A design decision had been argued from a behaviour
 * that did not exist, which is the pattern this repository keeps finding.
 *
 * The behaviour exists since #360, so the argument above stands on its own feet at last:
 * `Dialog` restores the focus only if what opened it is still in the document, and a
 * menu item that vanished with its menu is exactly the case where it cannot.
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
  const { nombre, usuario, url, password, favorito, tipo, titular, numero } = item.content

  /*
   * THE TYPE IS TOLD BY THE ICON THAT WAS ALREADY THERE, which is why telling the three
   * apart costs nothing: no extra element, no extra height, not one more DOM node. The
   * slot existed to say «this one has a URL», and saying «this one is a card» is the
   * same job done better.
   *
   * That matters beyond tidiness: the list is virtualised, and one of the eight limits
   * of verify-large-vault is that the DOM must not grow with the number of entries. A
   * badge next to the name would have been the obvious way to show a type and would
   * have been paid for on every row of a vault of 370.
   */
  const Icon = tipo === 'tarjeta' ? CreditCard : tipo === 'nota' ? StickyNote : url ? Globe : KeyRound

  /*
   * The second line, which is what tells two entries of the same service apart.
   *
   * A login shows its username and a card its cardholder. A NOTE SHOWS NOTHING, and that
   * is a decision rather than a gap: the only thing a note has to show is its body, and
   * the body is the entry — painting a preview of it here would put in the list's DOM
   * exactly the thing somebody wrote a note to keep out of sight. The row already knows
   * how to have no second line, so a note simply has none.
   *
   * AND NEVER THE CARD'S NUMBER, for the same reason the password is not painted: what
   * is not in the DOM cannot be read by an extension, a screenshot or somebody leaning
   * over. Not even its last four digits, which are what a bank asks for over the phone.
   */
  const subtitle = tipo === 'tarjeta' ? titular : tipo === 'nota' ? undefined : usuario

  /*
   * What the row's copy button copies, which is a different answer for each kind.
   *
   * A login gives its password and a card its NUMBER: that is the value that gets pasted
   * into a payment form, while the rest of a card is typed while looking at the plastic.
   *
   * A NOTE GIVES NOTHING, AND SO GETS NO BUTTON. The alternative on the table was a
   * disabled one, and what settles it is that the row ALREADY works this way: a login
   * with no password saved has had no copy button since this row existed, so absence is
   * the shape the list already has for «nothing to copy here». A disabled control on
   * every note would be a new inconsistency invented to avoid an old one, and it would
   * put a dead target in the list of a vault that could be mostly notes.
   *
   * The sentence travels with the value because the notice has to say WHICH thing was
   * copied — «Contraseña copiada» and «Número copiado» — and because the agreement is
   * the caller's business. See lib/vault/copy.ts.
   */
  const copyable =
    tipo === 'nota'
      ? undefined
      : tipo === 'tarjeta'
        ? numero && { value: numero, copied: 'Número copiado', subject: 'el número' }
        : password && { value: password, copied: 'Contraseña copiada', subject: 'la contraseña' }

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
        aria-label={subtitle ? `Editar ${nombre}, ${subtitle}` : `Editar ${nombre}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>

        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{nombre}</span>
          {subtitle ? (
            <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
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
        * The value is copied without ever being painted: it is in memory, in the already
        * decoded item, but it never enters the list's DOM. That holds for a card's number
        * exactly as it does for a password. The button only appears when there is
        * something to copy.
        */}
      {copyable && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Copiar ${copyable.subject} de ${nombre}`}
          onClick={() => void copySecret(copyable.copied, copyable.value)}
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
