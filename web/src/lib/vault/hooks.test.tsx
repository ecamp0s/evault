import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import { useDeleteItem, useCreateItem, useItems, usePersonalVault, useUpdateItem, useVaults } from './hooks'
import type { EncryptedItem, Vault } from './types'

/*
 * The wrapped key is a literal: these tests decrypt nothing, they only check the data
 * layer. What really opens it has its tests in cripto.test.ts.
 */
const VAULT_PERSONAL: Vault = {
  id: 'vault-personal',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta-de-prueba',
  wrapped_key_iv: 'nonce-de-prueba',
}

const TEAM_VAULT: Vault = {
  id: 'vault-equipo',
  name: 'Equipo',
  is_personal: false,
  role: 'owner',
  wrapped_key: 'clave-envuelta-de-prueba',
  wrapped_key_iv: 'nonce-de-prueba',
}

/*
 * Since encryption became real, a test item has to be really encrypted: the data layer
 * decrypts it on reading, and a plaintext fixture would show up as unreadable.
 */
let key: CryptoKey

// The `nombre` key is written out and not used as shorthand: it is a field of the
// blob, so the parameter may be in English but the key does not change.
function encryptedItem(id: string, vaultId: string, itemName: string): Promise<EncryptedItem> {
  return encryptItem(key, id, { nombre: itemName }, vaultId)
}

/*
 * A fresh client per test, with retries off. The production one retries 5xx, and here
 * that would only stretch the tests that check a failure.
 */
function wrapped(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/*
 * A real AxiosError and not an object that resembles one: interpretarError checks the
 * type, and an impostor would end up classified as a network error, which is the one
 * category that does get retried. The test would start measuring something else.
 */
function apiError(httpStatus: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: {}, headers, config: { headers } }

  return error
}

beforeEach(async () => {
  vi.restoreAllMocks()
  key = await unlockForTest()
})

describe('useVaults', () => {
  it('returns the vaults the API answers with', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [VAULT_PERSONAL] } } })

    const { result } = renderHook(() => useVaults(), { wrapper: wrapped(testQueryClient()) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([VAULT_PERSONAL])
  })

  it('usePersonalVault picks the personal one out of several', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: { vaults: [TEAM_VAULT, VAULT_PERSONAL] } },
    })

    const { result } = renderHook(() => usePersonalVault(), {
      wrapper: wrapped(testQueryClient()),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.id).toBe('vault-personal')
  })
})

describe('useItems', () => {
  it('returns the items already decoded', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: { items: [await encryptedItem('item-1', 'vault-personal', 'GitHub')] } },
    })

    const { result } = renderHook(() => useItems('vault-personal'), {
      wrapper: wrapped(testQueryClient()),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].content.nombre).toBe('GitHub')
    expect(result.current.data?.[0].vaultId).toBe('vault-personal')
  })

  it('asks for nothing until it is known which vault is being operated on', () => {
    const get = vi.spyOn(api, 'get')

    renderHook(() => useItems(null), { wrapper: wrapped(testQueryClient()) })

    expect(get).not.toHaveBeenCalled()
  })

  /*
   * The failure the vaultId in the cache key prevents. Without it, the second vault
   * would show the first one's items while the response arrived — that is, credentials
   * from the wrong context.
   */
  it('does not serve one vault\'s cache for another', async () => {
    const fromPersonal = await encryptedItem('item-1', 'vault-personal', 'De la personal')
    const fromTeam = await encryptedItem('item-2', 'vault-equipo', 'De la de equipo')

    const get = vi.spyOn(api, 'get').mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: { items: url.includes('vault-personal') ? [fromPersonal] : [fromTeam] },
        },
      }),
    )

    const queryClient = testQueryClient()

    const personal = renderHook(() => useItems('vault-personal'), { wrapper: wrapped(queryClient) })
    await waitFor(() => expect(personal.result.current.isSuccess).toBe(true))

    const team = renderHook(() => useItems('vault-equipo'), { wrapper: wrapped(queryClient) })
    await waitFor(() => expect(team.result.current.isSuccess).toBe(true))

    expect(personal.result.current.data?.[0].content.nombre).toBe('De la personal')
    expect(team.result.current.data?.[0].content.nombre).toBe('De la de equipo')
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe('mutations', () => {
  /*
   * These two used to assert that `invalidateQueries` had been called with a given key,
   * which is a test of the plumbing rather than of the behaviour — and it passed
   * happily while a delete cost 1.191 ms and a full download of the vault.
   *
   * What is asserted now is what #352 and #354 actually ask for: the list ends up right
   * WITHOUT asking the server for it again. That is why `get` is counted.
   */
  /*
   * The list and the mutation in ONE renderHook, which is how a screen uses them:
   * ItemList holds both. Mounted as two separate hooks they share the query client but
   * live in two React trees, and an update to one does not re-render the other — the
   * cache was right and `result.current` was stale, which reads exactly like the fix
   * not working.
   */
  async function screenWith<T>(
    queryClient: QueryClient,
    items: EncryptedItem[],
    mutation: () => T,
  ) {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { items } } })
    const { result } = renderHook(
      () => ({ list: useItems('vault-personal'), mutation: mutation() }),
      { wrapper: wrapped(queryClient) },
    )

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    return { get, result }
  }

  const names = (result: { current: { list: { data?: { content: { nombre: string } }[] } } }) =>
    result.current.list.data?.map((item) => item.content.nombre)

  it('creating adds the entry to the list without asking for it again', async () => {
    const queryClient = testQueryClient()
    const { get, result } = await screenWith(
      queryClient,
      [await encryptedItem('item-1', 'vault-personal', 'La que ya estaba')],
      () => useCreateItem('vault-personal'),
    )

    vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: await encryptedItem('item-2', 'vault-personal', 'Nueva') } },
    })

    result.current.mutation.mutate({ nombre: 'Nueva' })

    await waitFor(() =>
      // Last, which is where ListVaultItems puts it: ordered by created_at, then id.
      expect(names(result)).toEqual(['La que ya estaba', 'Nueva']),
    )
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('deleting removes the entry from the list without asking for it again', async () => {
    const queryClient = testQueryClient()
    const { get, result } = await screenWith(
      queryClient,
      [
        await encryptedItem('item-1', 'vault-personal', 'La que se queda'),
        await encryptedItem('item-2', 'vault-personal', 'La que se va'),
      ],
      () => useDeleteItem('vault-personal'),
    )

    vi.spyOn(api, 'delete').mockResolvedValue({ data: null })

    result.current.mutation.mutate('item-2')

    await waitFor(() => expect(names(result)).toEqual(['La que se queda']))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('editing replaces the entry in place, without asking for the list again', async () => {
    /*
     * In place and not at the end: an entry that moves when you edit it makes the list
     * feel like it reordered itself behind your back. The server would not move it
     * either — ListVaultItems orders by created_at, which editing does not change.
     */
    const queryClient = testQueryClient()
    const { get, result } = await screenWith(
      queryClient,
      [
        await encryptedItem('item-1', 'vault-personal', 'La primera'),
        await encryptedItem('item-2', 'vault-personal', 'La segunda'),
      ],
      () => useUpdateItem('vault-personal'),
    )

    vi.spyOn(api, 'patch').mockResolvedValue({
      data: { data: { item: await encryptedItem('item-1', 'vault-personal', 'La primera, editada') } },
    })

    result.current.mutation.mutate({ itemId: 'item-1', content: { nombre: 'La primera, editada' } })

    await waitFor(() => expect(names(result)).toEqual(['La primera, editada', 'La segunda']))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('leaves the list stale so the next mount asks the server who is right', async () => {
    /*
     * The half of #354 that is a decision and not an optimisation. Without it the cache
     * would be as correct as the last thing typed on THIS device, and a vault open on a
     * phone as well — which is the real use since Iteration 9 — would drift for as long
     * as the session lasted.
     *
     * `refetchType: 'none'`, so being stale costs no request now: it is the next mount
     * that pays for it.
     */
    const queryClient = testQueryClient()
    const { result } = await screenWith(
      queryClient,
      [await encryptedItem('item-1', 'vault-personal', 'La que ya estaba')],
      () => useDeleteItem('vault-personal'),
    )

    vi.spyOn(api, 'delete').mockResolvedValue({ data: null })

    result.current.mutation.mutate('item-1')
    await waitFor(() => expect(names(result)).toEqual([]))

    expect(queryClient.getQueryState(['vaults', 'vault-personal', 'items'])?.isInvalidated).toBe(true)
  })

  it('creating sends the content packed and not in the clear', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: await encryptedItem('item-1', 'vault-personal', 'GitHub') } },
    })

    const { result } = renderHook(() => useCreateItem('vault-personal'), {
      wrapper: wrapped(testQueryClient()),
    })

    result.current.mutate({ nombre: 'GitHub', password: 'secreto' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [url, body] = post.mock.calls[0]

    expect(url).toBe('/vaults/vault-personal/items')
    expect(Object.keys(body as object)).toEqual(['ciphertext', 'iv', 'version'])
    expect(JSON.stringify(body)).not.toContain('GitHub')
  })
})

describe('retries', () => {
  /*
   * A 401 is not retried: session.ts's interceptor already closes the session, so
   * repeating only delays the eviction and sends two more requests carrying a token
   * known to be invalid.
   */
  it('a 401 is not retried', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiError(401))

    const { result } = renderHook(() => useVaults(), { wrapper: wrapped(createQueryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('a 404 is not retried either', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiError(404))

    const { result } = renderHook(() => useItems('vault-que-no-existe'), {
      wrapper: wrapped(createQueryClient()),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
  })
})
