import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { updateItem, deleteItem, createItem, listItems, listVaults } from '@/lib/vault/api'
import { queryKeys } from '@/lib/vault/queryKeys'
import type { ItemContent, Item, Vault } from '@/lib/vault/types'

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

export function useCreateItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (content: ItemContent) => createItem(vaultId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.items(vaultId) }),
  })
}

export function useUpdateItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ itemId, content }: { itemId: string; content: ItemContent }) =>
      updateItem(vaultId, itemId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.items(vaultId) }),
  })
}

export function useDeleteItem(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (itemId: string) => deleteItem(vaultId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.items(vaultId) }),
  })
}
