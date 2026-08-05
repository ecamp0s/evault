import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import { useBorrarItem, useCrearItem, useItems, useVaultPersonal, useVaults } from './hooks'
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

const VAULT_EQUIPO: Vault = {
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

function encryptedItem(id: string, vaultId: string, nombre: string): Promise<EncryptedItem> {
  return encryptItem(key, id, { nombre }, vaultId)
}

/*
 * Un cliente nuevo por test, con reintentos apagados. El de producción reintenta
 * los 5xx, y aquí eso solo alargaría los tests que comprueban un fallo.
 */
function wrapped(cliente: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  )
}

function clienteDeTest(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/*
 * Un AxiosError de verdad y no un objeto que se le parezca: interpretarError
 * comprueba el tipo, y un impostor acabaría clasificado como error de red, que es
 * la única categoría que sí se reintenta. El test pasaría a medir otra cosa.
 */
function errorDeApi(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

beforeEach(async () => {
  vi.restoreAllMocks()
  key = await unlockForTest()
})

describe('useVaults', () => {
  it('devuelve los vaults que responde la API', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { vaults: [VAULT_PERSONAL] } } })

    const { result } = renderHook(() => useVaults(), { wrapper: wrapped(clienteDeTest()) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([VAULT_PERSONAL])
  })

  it('useVaultPersonal escoge el personal de entre varios', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: { vaults: [VAULT_EQUIPO, VAULT_PERSONAL] } },
    })

    const { result } = renderHook(() => useVaultPersonal(), {
      wrapper: wrapped(clienteDeTest()),
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
      wrapper: wrapped(clienteDeTest()),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].content.nombre).toBe('GitHub')
    expect(result.current.data?.[0].vaultId).toBe('vault-personal')
  })

  it('no pide nada mientras no se sepa sobre qué vault se opera', () => {
    const get = vi.spyOn(api, 'get')

    renderHook(() => useItems(null), { wrapper: wrapped(clienteDeTest()) })

    expect(get).not.toHaveBeenCalled()
  })

  /*
   * El fallo que la clave de caché con vaultId previene. Sin él, el segundo vault
   * mostraría los items del primero mientras llega la respuesta, es decir
   * credenciales del contexto equivocado.
   */
  it('no sirve la caché de un vault para otro', async () => {
    const dePersonal = await encryptedItem('item-1', 'vault-personal', 'De la personal')
    const deEquipo = await encryptedItem('item-2', 'vault-equipo', 'De la de equipo')

    const get = vi.spyOn(api, 'get').mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: { items: url.includes('vault-personal') ? [dePersonal] : [deEquipo] },
        },
      }),
    )

    const cliente = clienteDeTest()

    const personal = renderHook(() => useItems('vault-personal'), { wrapper: wrapped(cliente) })
    await waitFor(() => expect(personal.result.current.isSuccess).toBe(true))

    const equipo = renderHook(() => useItems('vault-equipo'), { wrapper: wrapped(cliente) })
    await waitFor(() => expect(equipo.result.current.isSuccess).toBe(true))

    expect(personal.result.current.data?.[0].content.nombre).toBe('De la personal')
    expect(equipo.result.current.data?.[0].content.nombre).toBe('De la de equipo')
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe('mutaciones', () => {
  it('crear invalida la lista de ese vault', async () => {
    const cliente = clienteDeTest()
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')

    vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: await encryptedItem('item-1', 'vault-personal', 'Nuevo') } },
    })

    const { result } = renderHook(() => useCrearItem('vault-personal'), {
      wrapper: wrapped(cliente),
    })

    result.current.mutate({ nombre: 'Nuevo' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['vaults', 'vault-personal', 'items'] })
  })

  it('borrar invalida la lista de ese vault', async () => {
    const cliente = clienteDeTest()
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')

    vi.spyOn(api, 'delete').mockResolvedValue({ data: null })

    const { result } = renderHook(() => useBorrarItem('vault-personal'), {
      wrapper: wrapped(cliente),
    })

    result.current.mutate('item-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['vaults', 'vault-personal', 'items'] })
  })

  it('crear manda el contenido empaquetado y no en claro', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { data: { item: await encryptedItem('item-1', 'vault-personal', 'GitHub') } },
    })

    const { result } = renderHook(() => useCrearItem('vault-personal'), {
      wrapper: wrapped(clienteDeTest()),
    })

    result.current.mutate({ nombre: 'GitHub', password: 'secreto' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [url, cuerpo] = post.mock.calls[0]

    expect(url).toBe('/vaults/vault-personal/items')
    expect(Object.keys(cuerpo as object)).toEqual(['ciphertext', 'iv', 'version'])
    expect(JSON.stringify(cuerpo)).not.toContain('GitHub')
  })
})

describe('reintentos', () => {
  /*
   * Un 401 no se reintenta: el interceptor de session.ts ya cierra la sesión, así
   * que repetir solo retrasa la expulsión y manda dos peticiones más con un token
   * que se sabe inválido.
   */
  it('un 401 no se reintenta', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(errorDeApi(401))

    const { result } = renderHook(() => useVaults(), { wrapper: wrapped(createQueryClient()) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('un 404 tampoco se reintenta', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue(errorDeApi(404))

    const { result } = renderHook(() => useItems('vault-que-no-existe'), {
      wrapper: wrapped(createQueryClient()),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
  })
})
