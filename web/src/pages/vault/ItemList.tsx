import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, Download, Plus, Search, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SORT_LABELS, sortItems, type SortOrder } from '@/lib/vault/sort'
import { useSortPreference } from '@/lib/vault/sortPreference'
import { Input } from '@/components/ui/input'
import { logOut } from '@/lib/auth'
import { useItems, useActiveVault, useUpdateItem } from '@/lib/vault/hooks'
import { VaultLocked } from '@/lib/vault/keyInMemory'
import { filterItems } from '@/lib/vault/search'
import { tagsInVault } from '@/lib/vault/tags'
import type { Item, ItemContent } from '@/lib/vault/types'
import { Loading, LoadError, NoResults, EmptyVault, VaultClosed } from './ListStates'
import { DeleteDialog } from './DeleteDialog'
import { ItemDialog } from './ItemDialog'
import { ExportDialog } from './ExportDialog'
import { ImportDialog } from './ImportDialog'
import { ItemRows } from './ItemRows'

/**
 * The list of stored credentials.
 *
 * It chains two queries: first which the active vault is, and only then its items. It
 * follows from the tenant context travelling explicitly and not in a session (ADR-004):
 * the client cannot ask for items until it knows which vault they belong to.
 *
 * That chain is also why the states are handled for both queries at once. Were they
 * looked at separately, between the vaults query answering and the items one starting
 * there would be an instant with the first resolved and the second not yet begun, and
 * the interface would show the empty state for a blink: it would tell the user their
 * vault holds nothing right before painting their passwords.
 */
export function ItemList() {
  const vault = useActiveVault()
  const items = useItems(vault.data?.id)

  /*
   * null closed; 'nuevo' creating; an item, editing it. One single state instead of a
   * boolean plus the item, so that the impossible combination of «closed but with an
   * item» or «open without knowing which» cannot exist.
   */
  const [editing, setEditing] = useState<Item | 'nuevo' | null>(null)

  // Apart from the editing one: deleting is not a mode of editing, and mixing them
  // would force telling afterwards with which intent the same entry was opened.
  const [deleting, setDeleting] = useState<Item | null>(null)

  /*
   * What is searched for is state of this screen and not of the URL. Putting it in the
   * query string would leave what the user searches for in the browser's history, and in
   * a password manager the name of a service already says where they have an account.
   */
  const [query, setQuery] = useState('')
  const { order, setOrder } = useSortPreference()
  const update = useUpdateItem(vault.data?.id ?? '')

  /*
   * Marking a favourite is an ordinary edit, and it goes through the same mutation as
   * the dialog: the content is re-encrypted whole and written back. There is no cheaper
   * path and there should not be — the server cannot patch one field of something it
   * cannot read.
   *
   * UNMARKING DELETES THE KEY, it does not write `false`. That is the blob's contract
   * in `types.ts`: what is not filled in is omitted, and a boolean would add a key
   * saying «no» to every entry that is not a favourite.
   *
   * If it fails, the list stays as it was and the notice says so. It is not made
   * optimistic on purpose: a star that lights up and goes out again is worse than one
   * that takes a moment, and the write already costs a single request since #354.
   */
  const toggleFavourite = (item: Item) => {
    const content: ItemContent = { ...item.content }

    if (content.favorito) {
      delete content.favorito
    } else {
      content.favorito = true
    }

    update.mutate(
      { itemId: item.id, content },
      { onError: () => toast.error('No hemos podido guardar el cambio. Inténtalo de nuevo.') },
    )
  }
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  /*
   * Before the conditional returns below, because a hook cannot sit behind a branch.
   * Hence the `?? []`: there may still be no data at this point.
   *
   * The filtering is memoised because it walks the already decrypted content of every
   * item on each keystroke. With today's vaults it would make no difference, but the
   * client downloads the whole vault by design (ADR-001) and that number only grows.
   */
  /*
   * TWO MEMOS AND NOT ONE, AND THE ORDER OF THE TWO IS THE POINT. Sorting depends on
   * the data and the chosen order; filtering depends on what has been typed. Kept
   * apart, a keystroke re-runs only the filter, and the 370 names go through the
   * collator once per load and not once per letter — which is the defect #351 had to
   * fix in Iteration 11 and there is no reason to reintroduce.
   *
   * Sorting FIRST and filtering afterwards, never the other way round: `filterItems`
   * preserves the order it receives, so the results of a search come out sorted too.
   * Filtering first would be cheaper and would leave the matches in the order the
   * server sent them.
   */
  const sorted = useMemo(() => sortItems(items.data ?? [], order), [items.data, order])
  const matches = useMemo(() => filterItems(sorted, query), [sorted, query])

  /*
   * Computed from the whole vault and not from what is on screen: the editor has to be
   * able to suggest a tag that no visible entry carries.
   *
   * Memoised on the data alone, so typing in the search box does not walk the 370
   * entries again — the same reason the sorting has its own memo.
   */
  const tagsInUse = useMemo(() => tagsInVault(items.data ?? []), [items.data])

  /*
   * The locked vault comes before the generic error, and it is no arbitrary order: it
   * arrives as a query failure just like a downed network, but it is not one. Without
   * this branch, the screen would invite checking the connection when the connection is
   * perfectly fine and what is missing is the master password.
   */
  if (vault.error instanceof VaultLocked || items.error instanceof VaultLocked) {
    /*
     * Only the session is closed, with no navigation. It is the pattern the 401
     * interceptor in lib/session.ts already uses: emptying the store is enough, because
     * the guard reacts to the change and takes people to the login. Navigating from here
     * would tie this screen to the router for nothing.
     */
    return <VaultClosed onSignInAgain={() => void logOut()} />
  }

  if (vault.isError || items.isError) {
    return (
      <LoadError
        onRetry={() => {
          void (vault.isError ? vault.refetch() : items.refetch())
        }}
      />
    )
  }

  // The items one has not started while there is no vault, so its isPending on its own
  // does not tell «waiting for the vault» from «really loading».
  if (vault.isPending || !vault.data || items.isPending) {
    return <Loading />
  }

  const vaultId = vault.data.id

  return (
    <>
      {items.data.length === 0 ? (
        <EmptyVault
          onCreate={() => setEditing('nuevo')}
          onImport={() => setImporting(true)}
        />
      ) : (
        <div className="flex flex-col">
          {/*
            * The toolbar sticks below the header. See #351.
            *
            * WHY IT IS NOT ENOUGH TO LEAVE IT AT THE TOP OF THE PAGE: the search box is
            * the main control of this screen, and with 370 entries the page is 27.532 px
            * tall — looking something up meant going all the way back to the top first,
            * which is the most frequent gesture of the day.
            *
            * `top-14` is the header's height, so the two sit flush. The negative
            * margins undo the padding `main` puts around it: without them the rows show
            * through the gap at the sides and above while scrolling, and the toolbar
            * looks like it is floating over its own page. The `pb-4` replaces the gap
            * that used to separate it from the list, so the seam stays covered.
            */}
          <div className="sticky top-14 z-10 -mx-4 -mt-4 flex flex-wrap items-center gap-2 bg-background px-4 pt-4 pb-4 md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
            <div className="relative flex-1 basis-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Buscar en la vault"
                placeholder="Buscar…"
                className="pl-9"
              />
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Limpiar la búsqueda"
                  className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
                  onClick={() => setQuery('')}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            {/*
              * A menu and not a <select>, because there is no select in the design
              * system and a dropdown menu already is: the user menu mounts it on this
              * same screen, so its chunk is loaded and this costs nothing.
              *
              * The label carries the chosen order and not just «Ordenar», so that what
              * the list is doing can be read without opening anything — with 370
              * entries, a list in an order one cannot name looks like no order at all.
              */}
            <DropdownMenu>
              <DropdownMenuTrigger
                // Base UI composes with `render`, not with Radix's `asChild`.
                render={<Button size="sm" variant="outline" />}
              >
                <ArrowUpDown className="size-4" aria-hidden="true" />
                {SORT_LABELS[order]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={order}
                  onValueChange={(value) => setOrder(value as SortOrder)}
                >
                  {(Object.keys(SORT_LABELS) as SortOrder[]).map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {SORT_LABELS[value]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" onClick={() => setEditing('nuevo')}>
              <Plus className="size-4" aria-hidden="true" />
              Nueva entrada
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setExporting(true)}
              disabled={(items.data ?? []).length === 0}
            >
              <Download className="size-4" aria-hidden="true" />
              Exportar
            </Button>

            <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
              <Upload className="size-4" aria-hidden="true" />
              Importar
            </Button>
          </div>

          {matches.length === 0 ? (
            <NoResults query={query} />
          ) : (
            /*
             * What goes in here is ALREADY FILTERED. ItemRows decides which of these to
             * paint and nothing else — the search runs above, over every item in the
             * vault. See the note in ItemRows.tsx about why that order is the one thing
             * that cannot be swapped.
             */
            <ItemRows
              items={matches}
              onEdit={setEditing}
              onDelete={setDeleting}
              onToggleFavourite={toggleFavourite}
            />
          )}
        </div>
      )}

      {/*
        * Mounted only when there is something to edit, and keyed per entry: that way the
        * form is born with its values instead of resynchronising with an effect, and
        * opening one entry after another cannot show the previous one's data.
        */}
      {editing !== null && (
        <ItemDialog
          key={editing === 'nuevo' ? 'nuevo' : editing.id}
          vaultId={vaultId}
          item={editing === 'nuevo' ? null : editing}
          tagsInUse={tagsInUse}
          onClose={() => setEditing(null)}
        />
      )}

      {importing && (
        <ImportDialog
          vaultId={vaultId}
          items={items.data ?? []}
          onClose={() => setImporting(false)}
        />
      )}

      {exporting && (
        <ExportDialog items={items.data ?? []} onClose={() => setExporting(false)} />
      )}

      {deleting !== null && (
        <DeleteDialog
          key={deleting.id}
          vaultId={vaultId}
          item={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
