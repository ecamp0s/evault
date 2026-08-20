import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import type { ItemContent, EncryptedItem, Vault } from '@/lib/vault/types'
import { ItemList } from './ItemList'

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta-de-prueba',
  wrapped_key_iv: 'nonce-de-prueba',
}

/*
 * Since encryption became real, a test item has to be really encrypted: the screen
 * decrypts it when painting, and a plaintext fixture would show up as unreadable.
 */
let vaultKey: CryptoKey

function encryptedItem(id: string, content: ItemContent): Promise<EncryptedItem> {
  return encryptItem(vaultKey, id, content, VAULT.id)
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <ItemList />
    </QueryClientProvider>,
  )
}

/**
 * Answers the two requests the screen chains: first the vaults and then that vault's
 * items.
 */
function apiReturning(items: EncryptedItem[]) {
  return vi.spyOn(api, 'get').mockImplementation((url: string) =>
    url === '/vaults'
      ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
      : Promise.resolve({ data: { data: { items } } }),
  )
}

function apiError(httpStatus: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: {}, headers, config: { headers } }

  return error
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vaultKey = await unlockForTest()
})

describe('ListaDeItems', () => {
  it('paints the vault\'s items', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'GitHub', usuario: 'ada@example.com' }),
      await encryptedItem('item-2', { nombre: 'Banco', usuario: '0001' }),
    ])

    renderPage()

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('Banco')).toBeInTheDocument()
  })

  /*
   * The criterion that matters most on this screen. The password is not painted, not
   * even hidden behind dots: what is not in the DOM is read by no extension, no
   * screenshot and nobody walking past behind.
   */
  it('paints the password nowhere in the DOM', async () => {
    apiReturning([
      await encryptedItem('item-1', {
        nombre: 'GitHub',
        usuario: 'ada@example.com',
        password: 'contraseña-secretísima',
        notas: 'notas privadas',
      }),
    ])

    const { container } = renderPage()

    await screen.findByText('GitHub')

    expect(container.innerHTML).not.toContain('contraseña-secretísima')
    expect(container.innerHTML).not.toContain('notas privadas')
    expect(screen.queryByText('contraseña-secretísima')).not.toBeInTheDocument()
  })

  /*
   * Reloading the page kills the key but not the token, so one arrives here with a
   * session and unable to decrypt. Before this was handled, the screen said «check your
   * connection», which is false: the network is fine and retrying fixes nothing.
   *
   * This test is the guarantee that the interface does not lie about the cause again.
   * Unlocking without leaving the screen arrives with issue #73.
   */
  it('says the vault is locked, and not that the connection is failing', async () => {
    useVaultKey.setState({ key: null })
    apiReturning([])

    renderPage()

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(screen.queryByText(/comprueba tu conexión/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

})

describe('searching', () => {
  it('filters the list by what is typed', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'GitHub', usuario: 'ada@example.com' }),
      await encryptedItem('item-2', { nombre: 'Banco', usuario: '0001' }),
    ])

    renderPage()

    await screen.findByText('GitHub')

    await userEvent.type(screen.getByLabelText('Buscar en la vault'), 'banco')

    expect(screen.getByText('Banco')).toBeInTheDocument()
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
  })

  /*
   * The filtering happens over what is already decrypted in memory. It cannot be
   * otherwise: the server cannot search what it cannot read (ADR-001). This test pins it
   * by checking that typing generates not one extra request.
   */
  it('does not call the API when searching', async () => {
    const get = apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    renderPage()

    await screen.findByText('GitHub')

    const requestsBefore = get.mock.calls.length

    await userEvent.type(screen.getByLabelText('Buscar en la vault'), 'github')

    expect(get.mock.calls).toHaveLength(requestsBefore)
  })

  /*
   * The no-results state cannot be the empty-vault one. If filtering showed «your vault
   * is empty», the user would read that they have lost their passwords for having typed
   * into a search field.
   */
  it('with no matches it does not say the vault is empty', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    renderPage()

    await screen.findByText('GitHub')

    await userEvent.type(screen.getByLabelText('Buscar en la vault'), 'no existe')

    expect(screen.getByText(/ninguna entrada coincide/i)).toBeInTheDocument()
    expect(screen.getByText(/tus otras entradas siguen ahí/i)).toBeInTheDocument()
    expect(screen.queryByText('Tu vault está vacía')).not.toBeInTheDocument()
  })

  it('clearing the search brings the whole list back', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'GitHub' }),
      await encryptedItem('item-2', { nombre: 'Banco' }),
    ])

    renderPage()

    await screen.findByText('GitHub')

    await userEvent.type(screen.getByLabelText('Buscar en la vault'), 'banco')
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar la búsqueda' }))

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Banco')).toBeInTheDocument()
  })

  /*
   * The search field does not appear with an empty vault: there is nothing to search,
   * and showing it over the state that invites creating the first entry only distracts.
   */
  it('is not shown when the vault is empty', async () => {
    apiReturning([])

    renderPage()

    await screen.findByText('Tu vault está vacía')

    expect(screen.queryByLabelText('Buscar en la vault')).not.toBeInTheDocument()
  })

  /*
   * What is searched for cannot end up in the URL: it would stay in the browser's
   * history, and in a password manager the name of a service already says where one has
   * an account.
   */
  it('does not leave what was searched for in the URL', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    renderPage()

    await screen.findByText('GitHub')

    await userEvent.type(screen.getByLabelText('Buscar en la vault'), 'github')

    expect(window.location.search).toBe('')
  })
})

describe('ListaDeItems', () => {
  it('shows the empty state when there is no item at all', async () => {
    apiReturning([])

    renderPage()

    expect(await screen.findByText('Tu vault está vacía')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Credenciales guardadas' })).not.toBeInTheDocument()
  })

  /*
   * Importing has to be reachable with an empty vault, which is the one situation in
   * which somebody wants to do it: they have just signed up and are bringing a copy
   * over.
   *
   * The test exists because this was broken from issue #123 until #157. The bar with the
   * button is only painted once there are entries, so to import one had to create an
   * entry by hand and delete it afterwards. Nobody detected it because the import was
   * always tested with items in front, which is precisely the case where it is not
   * needed.
   */
  it('allows importing with an empty vault', async () => {
    apiReturning([])

    renderPage()

    await screen.findByText('Tu vault está vacía')

    await userEvent.click(screen.getByRole('button', { name: 'Importar' }))

    expect(await screen.findByRole('dialog', { name: 'Importar entradas' })).toBeInTheDocument()
  })

  /*
   * This test is inverted from how it was born, and that is its whole story.
   *
   * During Iteration 2 it checked that the interface did NOT promise encryption, because
   * the content travelled encoded and saying so would have been a lie. With issue #59
   * closed the promise is true, so now it checks that it is made: what has to be
   * prevented is no longer promising too much, but the guarantee disappearing without
   * anybody noticing.
   *
   * If it ever fails again, the question is not how to make it pass, but whether the
   * encryption is still true.
   */
  it('promises encryption, now that it is true', async () => {
    apiReturning([])

    const { container } = renderPage()

    await screen.findByText('Tu vault está vacía')

    expect(container.textContent).toMatch(/cifra/i)
  })

  it('shows the error state when the items request fails', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.reject(apiError(500)),
    )

    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('No se ha podido cargar tu vault')).toBeInTheDocument()
  })

  it('shows the error state when the vaults request fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(apiError(500))

    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('retrying asks again and paints the list when it answers this time', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.reject(apiError(500)),
    )

    renderPage()

    await screen.findByRole('alert')

    // Encrypted before the mock: an await does not fit inside a synchronous callback.
    const item = await encryptedItem('item-1', { nombre: 'GitHub' })

    get.mockImplementation((url: string) =>
      url === '/vaults'
        ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
        : Promise.resolve({ data: { data: { items: [item] } } }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
  })

  /*
   * Between the vaults query answering and the items one starting there is a gap.
   * Without handling it, the screen would show «your vault is empty» for a blink right
   * before painting the user's passwords.
   */
  it('does not show the empty state while it is still loading', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    renderPage()

    expect(screen.queryByText('Tu vault está vacía')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('GitHub')).toBeInTheDocument())

    expect(screen.queryByText('Tu vault está vacía')).not.toBeInTheDocument()
  })

  it('marks the list as busy while loading', () => {
    apiReturning([])

    renderPage()

    expect(screen.getByLabelText('Cargando la vault')).toHaveAttribute('aria-busy', 'true')
  })

  it('the new entry button opens the empty form', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Nueva entrada/ }))

    expect(screen.getByText('Nueva entrada', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  it('the first one can be created from the empty state too', async () => {
    apiReturning([])

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Guardar la primera/ }))

    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('pressing a row opens that entry for editing', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub', usuario: 'ada@example.com' })])

    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar GitHub, ada@example.com' }),
    )

    expect(screen.getByText('Editar entrada')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('GitHub')
    expect(screen.getByLabelText('Usuario')).toHaveValue('ada@example.com')
  })

  /*
   * The acceptance criterion of issue #56: without reloading. What achieves it is the
   * cache invalidation in the mutation, so the test checks the visible effect and not
   * the call.
   */
  it('creating an entry makes it appear in the list without reloading', async () => {
    const get = apiReturning([])

    // Encrypted before the mock: an await does not fit inside a synchronous callback.
    const created = await encryptedItem('item-1', { nombre: 'Recién creada' })

    vi.spyOn(api, 'post').mockImplementation(() => {
      // From here on the API returns the new item, as it really would.
      get.mockImplementation((url: string) =>
        url === '/vaults'
          ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
          : Promise.resolve({ data: { data: { items: [created] } } }),
      )

      return Promise.resolve({ data: { data: { item: created } } })
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Guardar la primera/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Recién creada')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Recién creada')).toBeInTheDocument()
  })

  /*
   * The acceptance criterion of issue #57. As with creation, what achieves it is the
   * cache invalidation, so the visible effect is checked and not the call.
   */
  it('deleting an entry removes it from the list without reloading', async () => {
    const get = apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    vi.spyOn(api, 'delete').mockImplementation(() => {
      get.mockImplementation((url: string) =>
        url === '/vaults'
          ? Promise.resolve({ data: { data: { vaults: [VAULT] } } })
          : Promise.resolve({ data: { data: { items: [] } } }),
      )

      return Promise.resolve({ data: null })
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Borrar GitHub' }))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByText('Tu vault está vacía')).toBeInTheDocument()
  })

  /*
   * Five identical «Borrar» buttons say nothing to somebody navigating with a screen
   * reader: the label carries the entry's name.
   */
  it('every delete button names its entry', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'GitHub' }),
      await encryptedItem('item-2', { nombre: 'Banco' }),
    ])

    renderPage()

    expect(await screen.findByRole('button', { name: 'Borrar GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Borrar Banco' })).toBeInTheDocument()
  })

  it('deleting and editing are different actions on the same row', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub' })])

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Borrar GitHub' }))

    expect(screen.getByRole('heading', { name: /Borrar «GitHub»/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
  })

  /*
   * An item the client cannot read must not bring the whole list down. It really happens
   * in Iteration 3 with an item encrypted under a different master password.
   */
  it('paints an unreadable item without breaking the rest of the list', async () => {
    apiReturning([
      { ...await encryptedItem('item-1', { nombre: 'GitHub' }), version: 99 },
      await encryptedItem('item-2', { nombre: 'Banco' }),
    ])

    renderPage()

    expect(await screen.findByText('No se puede leer esta entrada')).toBeInTheDocument()
    expect(screen.getByText('Banco')).toBeInTheDocument()
  })
})
