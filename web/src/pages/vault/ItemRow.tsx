import { Copy, Globe, KeyRound, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copySecret } from '@/lib/vault/copy'
import type { Item } from '@/lib/vault/types'

interface ItemRowProps {
  item: Item
  onEdit: () => void
  onDelete: () => void
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
export function ItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  const { nombre, usuario, url, password } = item.content

  return (
    <li className="flex items-center gap-1 rounded-lg border border-border pr-2 transition-colors hover:bg-muted/50">
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
    </li>
  )
}
