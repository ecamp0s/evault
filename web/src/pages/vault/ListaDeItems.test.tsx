import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { empaquetar } from '@/lib/vault/sinCifrar'
import type { ContenidoDeItem, ItemCifrado, Vault } from '@/lib/vault/tipos'
import { ListaDeItems } from './ListaDeItems'

const VAULT: Vault = { id: 'vault-1', name: 'Personal', is_personal: true, role: 'owner' }

function itemCifrado(id: string, contenido: ContenidoDeItem): ItemCifrado {
  return {
    id,
    vault_id: VAULT.id,
    ...empaquetar(contenido),
    created_at: null,
    updated_at: null,
  }
}

function pintar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={cliente}>
      <ListaDeItems />
    </QueryClientProvider>,
  )
}

/**
 * Responde a las dos peticiones que encadena la pantalla: primero los vaults y
 * después los items de ese vault.
 */
function apiQueResponde(items: ItemCifrado[]) {
  return vi.spyOn(api, 'get').mockImplementation((url: string) =>
    url === '/vaults'
      ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
      : Promise.resolve({ data: { data: { items } } }),
  )
}

function errorDeApi(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ListaDeItems', () => {
  it('pinta los items del vault', async () => {
    apiQueResponde([
      itemCifrado('item-1', { nombre: 'GitHub', usuario: 'ada@example.com' }),
      itemCifrado('item-2', { nombre: 'Banco', usuario: '0001' }),
    ])

    pintar()

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Banco')).toBeInTheDocument()
  })

  /*
   * El criterio que más importa de esta pantalla. La contraseña no se pinta ni
   * oculta tras puntos: lo que no está en el DOM no lo lee una extensión, ni una
   * captura, ni quien pase por detrás.
   */
  it('no pinta la contraseña en ninguna parte del DOM', async () => {
    apiQueResponde([
      itemCifrado('item-1', {
        nombre: 'GitHub',
        usuario: 'ada@example.com',
        password: 'contraseña-secretísima',
        notas: 'notas privadas',
      }),
    ])

    const { container } = pintar()

    await screen.findByText('GitHub')

    expect(container.innerHTML).not.toContain('contraseña-secretísima')
    expect(container.innerHTML).not.toContain('notas privadas')
    expect(screen.queryByText('contraseña-secretísima')).not.toBeInTheDocument()
  })

  it('muestra el estado vacío cuando no hay ningún item', async () => {
    apiQueResponde([])

    pintar()

    expect(await screen.findByText('Tu vault está vacía')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Credenciales guardadas' })).not.toBeInTheDocument()
  })

  /*
   * Mientras dure la deuda del issue #59 la interfaz no puede prometer cifrado,
   * porque el contenido viaja codificado y no cifrado. Es el texto que sale solo
   * al escribir un gestor de contraseñas, y por eso conviene un test que lo frene.
   */
  it('no promete cifrado mientras el contenido no esté cifrado', async () => {
    apiQueResponde([])

    const { container } = pintar()

    await screen.findByText('Tu vault está vacía')

    expect(container.textContent).not.toMatch(/cifrad/i)
  })

  it('muestra el estado de error si falla la petición de items', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.reject(errorDeApi(500)),
    )

    pintar()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('No se ha podido cargar tu vault')).toBeInTheDocument()
  })

  it('muestra el estado de error si falla la petición de vaults', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(errorDeApi(500))

    pintar()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('reintentar vuelve a pedir y pinta la lista si esta vez responde', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.reject(errorDeApi(500)),
    )

    pintar()

    await screen.findByRole('alert')

    get.mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.resolve({
            data: { data: { items: [itemCifrado('item-1', { nombre: 'GitHub' })] } },
          }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
  })

  /*
   * Entre que responde la consulta de vaults y arranca la de items hay un hueco.
   * Sin tratarlo, la pantalla enseñaría «tu vault está vacía» durante un parpadeo
   * justo antes de pintar las contraseñas del usuario.
   */
  it('no enseña el estado vacío mientras todavía está cargando', async () => {
    apiQueResponde([itemCifrado('item-1', { nombre: 'GitHub' })])

    pintar()

    expect(screen.queryByText('Tu vault está vacía')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('GitHub')).toBeInTheDocument())

    expect(screen.queryByText('Tu vault está vacía')).not.toBeInTheDocument()
  })

  it('marca la lista como ocupada mientras carga', () => {
    apiQueResponde([])

    pintar()

    expect(screen.getByLabelText('Cargando la vault')).toHaveAttribute('aria-busy', 'true')
  })

  it('el botón de nueva entrada abre el formulario vacío', async () => {
    apiQueResponde([itemCifrado('item-1', { nombre: 'GitHub' })])

    pintar()

    await userEvent.click(await screen.findByRole('button', { name: /Nueva entrada/ }))

    expect(screen.getByText('Nueva entrada', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  it('desde el estado vacío también se puede crear la primera', async () => {
    apiQueResponde([])

    pintar()

    await userEvent.click(await screen.findByRole('button', { name: /Guardar la primera/ }))

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('pulsar una fila abre esa entrada para editarla', async () => {
    apiQueResponde([itemCifrado('item-1', { nombre: 'GitHub', usuario: 'ada@example.com' })])

    pintar()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar GitHub, ada@example.com' }),
    )

    expect(screen.getByText('Editar entrada')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Usuario')).toHaveValue('ada@example.com')
  })

  /*
   * El criterio de aceptación del issue #56: sin recargar. Lo que lo consigue es
   * la invalidación de la caché en la mutación, así que el test comprueba el
   * efecto visible y no la llamada.
   */
  it('crear una entrada la hace aparecer en la lista sin recargar', async () => {
    const get = apiQueResponde([])

    vi.spyOn(api, 'post').mockImplementation(() => {
      // A partir de aquí la API ya devuelve el item nuevo, como haría de verdad.
      get.mockImplementation((url: string) =>
        url === '/vaults'
          ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
          : Promise.resolve({
              data: { data: { items: [itemCifrado('item-1', { nombre: 'Recién creada' })] } },
            }),
      )

      return Promise.resolve({
        data: { data: { item: itemCifrado('item-1', { nombre: 'Recién creada' }) } },
      })
    })

    pintar()

    await userEvent.click(await screen.findByRole('button', { name: /Guardar la primera/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Recién creada')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Recién creada')).toBeInTheDocument()
  })

  /*
   * El criterio de aceptación del issue #57. Igual que con la creación, lo que lo
   * consigue es la invalidación de la caché, así que se comprueba el efecto
   * visible y no la llamada.
   */
  it('borrar una entrada la quita de la lista sin recargar', async () => {
    const get = apiQueResponde([itemCifrado('item-1', { nombre: 'GitHub' })])

    vi.spyOn(api, 'delete').mockImplementation(() => {
      get.mockImplementation((url: string) =>
        url === '/vaults'
          ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
          : Promise.resolve({ data: { data: { items: [] } } }),
      )

      return Promise.resolve({ data: null })
    })

    pintar()

    await userEvent.click(await screen.findByRole('button', { name: 'Borrar GitHub' }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByText('Tu vault está vacía')).toBeInTheDocument()
  })

  /*
   * Cinco botones «Borrar» idénticos no le dicen nada a quien navega con lector
   * de pantalla: la etiqueta lleva el nombre de la entrada.
   */
  it('cada botón de borrar nombra su entrada', async () => {
    apiQueResponde([
      itemCifrado('item-1', { nombre: 'GitHub' }),
      itemCifrado('item-2', { nombre: 'Banco' }),
    ])

    pintar()

    expect(await screen.findByRole('button', { name: 'Borrar GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrar Banco' })).toBeInTheDocument()
  })

  it('borrar y editar son acciones distintas sobre la misma fila', async () => {
    apiQueResponde([itemCifrado('item-1', { nombre: 'GitHub' })])

    pintar()

    await userEvent.click(await screen.findByRole('button', { name: 'Borrar GitHub' }))

    expect(screen.getByRole('heading', { name: /Borrar «GitHub»/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
  })

  /*
   * Un item que el cliente no sabe leer no puede tumbar la lista entera. Pasará
   * de verdad en la Iteración 3 con un item cifrado con otra contraseña maestra.
   */
  it('pinta un item ilegible sin romper el resto de la lista', async () => {
    apiQueResponde([
      { ...itemCifrado('item-1', { nombre: 'GitHub' }), version: 99 },
      itemCifrado('item-2', { nombre: 'Banco' }),
    ])

    pintar()

    expect(await screen.findByText('No se puede leer esta entrada')).toBeInTheDocument()
    expect(screen.getByText('Banco')).toBeInTheDocument()
  })
})
