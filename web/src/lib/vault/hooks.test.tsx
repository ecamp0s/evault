import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import { useDeleteItem, useCreateItem, useItems, usePersonalVault, useVaults } from './hooks'
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
  it('creating invalidates that vault\'s list', async () => {
    const queryClient = testQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: await encryptedItem('item-1', 'vault-personal', 'Nuevo') } },
    })

    const { result } = renderHook(() => useCreateItem('vault-personal'), {
      wrapper: wrapped(queryClient),
    })

    result.current.mutate({ nombre: 'Nuevo' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vaults', 'vault-personal', 'items'] })
  })

  it('deleting invalidates that vault\'s list', async () => {
    const queryClient = testQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    vi.spyOn(api, 'delete').mockResolvedValue({ data: null })

    const { result } = renderHook(() => useDeleteItem('vault-personal'), {
      wrapper: wrapped(queryClient),
    })

    result.current.mutate('item-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vaults', 'vault-personal', 'items'] })
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
