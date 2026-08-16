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
 * La clave envuelta es un literal: estos tests no descifran nada, solo comprueban
 * la capa de datos. Lo que la abre de verdad tiene sus tests en cripto.test.ts.
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
 * Desde el cifrado real, un item de prueba hay que cifrarlo de verdad: la capa de
 * datos lo descifra al leerlo, y un fixture en claro se vería como ilegible.
 */
let key: CryptoKey

// La clave `nombre` se escribe explícita y no como shorthand: es un campo del
// blob, así que el parámetro puede ir en inglés pero la clave no cambia.
function encryptedItem(id: string, vaultId: string, itemName: string): Promise<EncryptedItem> {
  return encryptItem(key, id, { nombre: itemName }, vaultId)
}

/*
 * Un cliente nuevo por test, con reintentos apagados. El de producción reintenta
 * los 5xx, y aquí eso solo alargaría los tests que comprueban un fallo.
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
 * Un AxiosError de verdad y no un objeto que se le parezca: interpretarError
 * comprueba el tipo, y un impostor acabaría clasificado como error de red, que es
 * la única categoría que sí se reintenta. El test pasaría a medir otra cosa.
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
  it('devuelve los vaults que responde la API', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [VAULT_PERSONAL] } } })

    const { result } = renderHook(() => useVaults(), { wrapper: wrapped(testQueryClient()) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([VAULT_PERSONAL])
  })

  it('usePersonalVault escoge el personal de entre varios', async () => {
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
  it('devuelve los items ya descodificados', async () => {
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

  it('no pide nada mientras no se sepa sobre qué vault se opera', () => {
    const get = vi.spyOn(api, 'get')

    renderHook(() => useItems(null), { wrapper: wrapped(testQueryClient()) })

    expect(get).not.toHaveBeenCalled()
  })

  /*
   * El fallo que la clave de caché con vaultId previene. Sin él, el segundo vault
   * mostraría los items del primero mientras llega la respuesta, es decir
   * credenciales del contexto equivocado.
   */
  it('no sirve la caché de un vault para otro', async () => {
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

describe('mutaciones', () => {
  it('crear invalida la lista de ese vault', async () => {
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

  it('borrar invalida la lista de ese vault', async () => {
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

  it('crear manda el contenido empaquetado y no en claro', async () => {
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

describe('reintentos', () => {
  /*
   * Un 401 no se reintenta: el interceptor de session.ts ya cierra la sesión, así
   * que repetir solo retrasa la expulsión y manda dos peticiones más con un token
   * que se sabe inválido.
   */
  it('un 401 no se reintenta', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiError(401))

    const { result } = renderHook(() => useVaults(), { wrapper: wrapped(createQueryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('un 404 tampoco se reintenta', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(apiError(404))

    const { result } = renderHook(() => useItems('vault-que-no-existe'), {
      wrapper: wrapped(createQueryClient()),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
  })
})
