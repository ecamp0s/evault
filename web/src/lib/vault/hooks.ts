import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  updateItem,
  deleteItem,
  createItem,
  listItems,
  listVaults,
  listTrash,
  purgeItem,
  restoreItem,
} from '@/lib/vault/api'
import { queryKeys } from '@/lib/vault/queryKeys'
import type { ItemContent, Item, TrashedItem, Vault } from '@/lib/vault/types'

/**
 * What the screens use.
 *
 * No screen imports axios, knows a URL, or knows what has to be invalidated after
 * saving. That lives here, so the four screens of the sprint do not repeat the same
 * plumbing with four different criteria.
 */

export function useVaults() {
  return useQuery<Vault[]>({
    queryKey: queryKeys.vaults(),
    /*
     * Wrapped and not passed by reference: listVaults takes an optional token for
     * unlocking at login, and TanStack Query calls queryFn with its own context as the
     * first argument, which is not a token.
     */
    queryFn: () => listVaults(),
  })
}

/**
 * The personal vault, which in Iteration 2 is the only one there is.
 *
 * It is derived from the listing instead of being fetched separately so that it shares
 * the cache: they are the same query seen two ways. Once shared vaults exist, this will
 * still hold as «the default vault».
 */
export function usePersonalVault() {
  const query = useVaults()

  return {
    ...query,
    data: query.data?.find((vault) => vault.is_personal) ?? null,
  }
}

/**
 * The vault the interface is operating on right now.
 *
 * In Iteration 2 it is always the personal one, because there is no other. It exists as
 * a concept of its own so that the day there is a vault picker it changes here and not
 * in every screen.
 *
 * That state belongs to the client and not to the server: the API is stateless and
 * keeps no active context. See ADR-004. Nor is a store needed: the response already
 * lives in the query cache, and duplicating it in zustand would create a second source
 * of truth free to drift.
 */
export function useActiveVault() {
  return usePersonalVault()
}

/**
 * A vault's items.
 *
 * With no vaultId the request is not fired: on startup the screen does not yet know
 * which vault it operates on, because the listing of vaults is still in flight.
 */
export function useItems(vaultId: string | null | undefined) {
  return useQuery<Item[]>({
    queryKey: queryKeys.items(vaultId ?? ''),
    queryFn: () => listItems(vaultId ?? ''),
    enabled: Boolean(vaultId),
  })
}

/**
 * Writing changes the list in place instead of asking for it again. See #352 and #354.
 *
 * WHAT IT USED TO DO AND WHAT THAT COST. Every mutation ended in
 * `invalidateQueries`, which is the right default and the reason the list never told a
 * lie. But here it is not one request: the refetch brings the WHOLE vault down and
 * decrypts it entry by entry, because the server cannot send a diff of something it
 * cannot read (ADR-001). Measured over 370 entries: **1.191 ms and two requests to
 * delete one row**, and — the same defect multiplied — **740 requests and four minutes
 * to import 370**, one POST and one full list read per entry, about 68.000 items
 * downloaded to write 370.
 *
 * WHAT IT DOES NOW is apply to the cached list exactly what the server just confirmed.
 * The response already carries the item; nothing has to be asked for twice.
 *
 * AND THE PART THAT IS NOT AN OPTIMISATION BUT A DECISION: the list is also marked
 * stale, with `refetchType: 'none'` so that nothing is fetched right now. That is what
 * keeps this honest on a second device — the cache holds what this device did, and the
 * next time the screen mounts it asks the server who is right. Skipping that would
 * leave a vault that is only ever as correct as the last thing typed on this laptop.
 */
function applyToList(
  queryClient: ReturnType<typeof useQueryClient>,
  vaultId: string,
  change: (items: Item[]) => Item[],
) {
  queryClient.setQueryData<Item[]>(queryKeys.items(vaultId), (items) => change(items ?? []))
  queryClient.invalidateQueries({ queryKey: queryKeys.items(vaultId), refetchType: 'none' })
}

export function useCreateItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (content: ItemContent) => createItem(vaultId, content),
    /*
     * At the end, which is where the server puts it: `ListVaultItems` orders by
     * created_at and then by id, so a new entry belongs last.
     *
     * SINCE #376 THIS NO LONGER DECIDES WHERE IT IS SEEN — the screen sorts what it
     * receives, so a new entry appears wherever its name or its date puts it. What is
     * kept here is the cache agreeing with the server, so that the next fetch changes
     * nothing.
     */
    onSuccess: (item) => applyToList(queryClient, vaultId, (items) => [...items, item]),
  })
}

export function useUpdateItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ itemId, content }: { itemId: string; content: ItemContent }) =>
      updateItem(vaultId, itemId, content),
    // In place, keeping its position: editing an entry does not move it in the list,
    // because its created_at has not changed.
    onSuccess: (updated) =>
      applyToList(queryClient, vaultId, (items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      ),
  })
}

export function useDeleteItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) => deleteItem(vaultId, itemId),
    // The deleted id and not the server's answer, which for a delete carries nothing.
    // Since #707 the entry is in the bin, so the bin's list is stale too: it is marked
    // and not refetched, and asks again the next time its screen mounts.
    onSuccess: (_result, itemId) => {
      applyToList(queryClient, vaultId, (items) => items.filter((item) => item.id !== itemId))
      queryClient.invalidateQueries({ queryKey: queryKeys.trash(vaultId), refetchType: 'none' })
    },
  })
}

/**
 * The bin (ADR-018 §2.4). Not asked for offline: it is not cached on the device, and
 * `listTrash` would refuse anyway.
 */
export function useTrash(vaultId: string | null | undefined, enabled = true) {
  return useQuery<TrashedItem[]>({
    queryKey: queryKeys.trash(vaultId ?? ''),
    queryFn: () => listTrash(vaultId ?? ''),
    enabled: Boolean(vaultId) && enabled,
  })
}

/** Removes an entry from the bin's cached list, whichever way it left. */
function leaveTrash(queryClient: ReturnType<typeof useQueryClient>, vaultId: string, itemId: string) {
  queryClient.setQueryData<TrashedItem[]>(queryKeys.trash(vaultId), (items) =>
    (items ?? []).filter((item) => item.id !== itemId),
  )
}

/**
 * Back into the vault's list with what the server answered, which is the same entry with
 * its dates untouched: the screen sorts what it receives, so it lands wherever its name or
 * its date puts it (#376).
 */
function putBack(queryClient: ReturnType<typeof useQueryClient>, vaultId: string, item: Item) {
  leaveTrash(queryClient, vaultId, item.id)
  applyToList(queryClient, vaultId, (items) => [...items.filter(({ id }) => id !== item.id), item])
}

export function useRestoreItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) => restoreItem(vaultId, itemId),
    onSuccess: (item) => putBack(queryClient, vaultId, item),
  })
}

/**
 * «Deshacer» right after deleting (#710): the same restore as the bin's, as a plain
 * function and not a hook.
 *
 * NOT A HOOK BECAUSE OF WHERE IT IS CALLED FROM. The button lives in the notice that
 * appears once the delete dialog has closed, so the component that deleted is already
 * gone when somebody presses it. A mutation hook of that dialog would belong to an
 * unmounted component; this only needs the query client, which outlives every screen.
 */
export async function undoDelete(
  queryClient: ReturnType<typeof useQueryClient>,
  vaultId: string,
  itemId: string,
): Promise<Item> {
  const item = await restoreItem(vaultId, itemId)

  putBack(queryClient, vaultId, item)

  return item
}

export function usePurgeItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) => purgeItem(vaultId, itemId),
    onSuccess: (_result, itemId) => leaveTrash(queryClient, vaultId, itemId),
  })
}
