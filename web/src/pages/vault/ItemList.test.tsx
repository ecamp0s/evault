import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { unlockForTest, encryptedItem as encryptItem } from '@/test/vault'
import { unpack } from '@/lib/vault/payload'
import type { ItemContent, EncryptedItem, ItemPayload, Vault } from '@/lib/vault/types'
import { DEFAULT_SORT_ORDER } from '@/lib/vault/sort'
import { useSortPreference } from '@/lib/vault/sortPreference'
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

/**
 * The body of a write, as `unpack` wants it.
 *
 * What travels in a PATCH is only the payload — ciphertext, iv and version — while
 * `unpack` takes a stored item, which also carries its id and its dates. They are not
 * the same shape, and the difference is worth keeping visible: the three fields that
 * matter here are the only ones the server ever sees the inside of, which is to say
 * none of them.
 */
function asStored(body: unknown): EncryptedItem {
  return {
    ...(body as ItemPayload),
    id: 'item-1',
    vault_id: VAULT.id,
    created_at: null,
    updated_at: null,
  }
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

  /*
   * The sort preference is persisted, so it survives from one test into the next and
   * whichever ran before would decide the order here. Reset explicitly rather than
   * hoping the default holds.
   */
  useSortPreference.setState({ order: DEFAULT_SORT_ORDER })
  localStorage.removeItem('evault.orden')
})

describe('ItemList', () => {
  /*
   * WHAT #376 EXISTS FOR, and why these tests mount more than three items.
   *
   * The list used to be painted in the order the server sent, which is `created_at`,
   * so a vault imported in one go appeared in the order of the file it came from.
   * Nothing noticed because the tests here mounted three items, and with three items
   * any order looks like an order.
   */
  it('paints the entries sorted by name, not in the order the server sent them', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Zulo' }),
      await encryptedItem('item-2', { nombre: 'Ana' }),
      await encryptedItem('item-3', { nombre: 'Medio' }),
    ])

    renderPage()

    await screen.findByText('Ana')

    const painted = screen.getAllByRole('listitem').map((row) => row.textContent)

    expect(painted[0]).toContain('Ana')
    expect(painted[1]).toContain('Medio')
    expect(painted[2]).toContain('Zulo')
  })

  it('changes the order when another one is chosen, and says which one is on', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Ana' }),
      await encryptedItem('item-2', { nombre: 'Zulo' }),
    ])

    renderPage()
    await screen.findByText('Ana')

    await userEvent.click(screen.getByRole('button', { name: /Nombre/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Añadida hace menos' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Añadida hace menos/ })).toBeInTheDocument()
    })
  })

  /*
   * Searching has to return sorted results too, which is why the screen sorts first and
   * filters afterwards. Filtering first would be cheaper and would hand back matches in
   * the order the server sent them.
   */
  it('keeps the results of a search sorted', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Banco Zeta' }),
      await encryptedItem('item-2', { nombre: 'Banco Ana' }),
    ])

    renderPage()
    await screen.findByText('Banco Ana')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en la vault' }), 'Banco')

    await waitFor(() => {
      const painted = screen.getAllByRole('listitem').map((row) => row.textContent)

      expect(painted[0]).toContain('Banco Ana')
      expect(painted[1]).toContain('Banco Zeta')
    })
  })

  /*
   * Favourites, and what is checked is the blob that leaves — not the star lighting up.
   *
   * The contract of `favorito` is `true` or ABSENT, never `false` (`types.ts`), because
   * FOUNDATION.md says to omit what is not filled in. A boolean would add a key saying
   * «no» to every one of the 370 entries, and nothing in the interface would show it.
   */
  it('marks a favourite from the row, without opening the dialog', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'Banco' })])
    const patch = vi
      .spyOn(api, 'patch')
      .mockImplementation(async (_url: string, body: unknown) => ({
        data: { data: { item: { id: 'item-1', vault_id: VAULT.id, ...(body as object) } } },
      }))

    renderPage()
    await screen.findByText('Banco')

    await userEvent.click(screen.getByRole('button', { name: 'Favorita: Banco' }))

    await waitFor(() => expect(patch).toHaveBeenCalledOnce())

    expect(await unpack(vaultKey, asStored(patch.mock.calls[0][1]))).toEqual({
      nombre: 'Banco',
      favorito: true,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('unmarking deletes the key instead of writing false', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'Banco', favorito: true })])
    const patch = vi
      .spyOn(api, 'patch')
      .mockImplementation(async (_url: string, body: unknown) => ({
        data: { data: { item: { id: 'item-1', vault_id: VAULT.id, ...(body as object) } } },
      }))

    renderPage()
    await screen.findByText('Banco')

    await userEvent.click(screen.getByRole('button', { name: 'Favorita: Banco' }))

    await waitFor(() => expect(patch).toHaveBeenCalledOnce())

    const content = await unpack(vaultKey, asStored(patch.mock.calls[0][1]))

    expect(content).toEqual({ nombre: 'Banco' })
    expect('favorito' in content).toBe(false)
  })

  it('paints favourites at the top of the list', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Ana' }),
      await encryptedItem('item-2', { nombre: 'Zulo', favorito: true }),
    ])

    renderPage()
    await screen.findByText('Ana')

    const painted = screen.getAllByRole('listitem').map((row) => row.textContent)

    expect(painted[0]).toContain('Zulo')
    expect(painted[1]).toContain('Ana')
  })

  it('tells a screen reader whether the entry is already a favourite', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'Banco', favorito: true })])

    renderPage()
    await screen.findByText('Banco')

    expect(screen.getByRole('button', { name: 'Favorita: Banco' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /*
   * Filtering by tag (#379). What makes tags worth having is being able to use them,
   * and what makes THIS honest is that the tag and the search box combine instead of
   * replacing each other.
   */
  it('offers the vault\'s tags with how many entries carry each', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Ana', etiquetas: ['trabajo'] }),
      await encryptedItem('item-2', { nombre: 'Bea', etiquetas: ['trabajo'] }),
      await encryptedItem('item-3', { nombre: 'Caj', etiquetas: ['banco'] }),
    ])

    renderPage()
    await screen.findByText('Ana')

    expect(screen.getByRole('button', { name: 'trabajo, 2 entradas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'banco, 1 entrada' })).toBeInTheDocument()
  })

  it('keeps only the entries carrying the chosen tag', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Ana', etiquetas: ['trabajo'] }),
      await encryptedItem('item-2', { nombre: 'Caj', etiquetas: ['banco'] }),
    ])

    renderPage()
    await screen.findByText('Ana')

    await userEvent.click(screen.getByRole('button', { name: 'trabajo, 1 entrada' }))

    await waitFor(() => expect(screen.queryByText('Caj')).not.toBeInTheDocument())
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  /*
   * The intersection, which is what #379 asked for by name: filtering by «trabajo» and
   * typing «banco» must give what matches BOTH, not one or the other.
   */
  it('combines the tag with the search instead of replacing it', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Banco del trabajo', etiquetas: ['trabajo'] }),
      await encryptedItem('item-2', { nombre: 'Correo del trabajo', etiquetas: ['trabajo'] }),
      await encryptedItem('item-3', { nombre: 'Banco de casa', etiquetas: ['casa'] }),
    ])

    renderPage()
    await screen.findByText('Banco del trabajo')

    await userEvent.click(screen.getByRole('button', { name: 'trabajo, 2 entradas' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en la vault' }), 'Banco')

    await waitFor(() => {
      const painted = screen.getAllByRole('listitem').map((row) => row.textContent)

      expect(painted).toHaveLength(1)
      expect(painted[0]).toContain('Banco del trabajo')
    })
  })

  it('can undo the filter in one go', async () => {
    apiReturning([
      await encryptedItem('item-1', { nombre: 'Ana', etiquetas: ['trabajo'] }),
      await encryptedItem('item-2', { nombre: 'Caj', etiquetas: ['banco'] }),
    ])

    renderPage()
    await screen.findByText('Ana')

    await userEvent.click(screen.getByRole('button', { name: 'trabajo, 1 entrada' }))
    await waitFor(() => expect(screen.queryByText('Caj')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Quitar el filtro' }))

    await waitFor(() => expect(screen.getByText('Caj')).toBeInTheDocument())
  })

  /*
   * A message that names only the search would lie by omission: two things are
   * narrowing the list, and saying one sends the user to widen the wrong one.
   */
  it('names the tag when nothing matches, not only what was typed', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'Ana', etiquetas: ['trabajo'] })])

    renderPage()
    await screen.findByText('Ana')

    await userEvent.click(screen.getByRole('button', { name: 'trabajo, 1 entrada' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en la vault' }), 'zzz')

    expect(
      await screen.findByText('Ninguna entrada con «trabajo» coincide con «zzz»'),
    ).toBeInTheDocument()
  })

  it('shows no tag row at all in a vault without tags', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'Ana' })])

    renderPage()
    await screen.findByText('Ana')

    expect(screen.queryByLabelText('Filtrar por etiqueta')).not.toBeInTheDocument()
  })

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

describe('ItemList', () => {
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

/**
 * What #349 promises, which none of the tests above could see.
 *
 * They all mount two or three entries, so the list has never been long in a test — and
 * that is precisely why the six defects of Iteration 11 went unnoticed until somebody
 * used the app with 370 passwords in it.
 */
describe('a long vault', () => {
  const MANY = 300

  /*
   * WHAT THESE TESTS CAN AND CANNOT SEE, because taking them for the whole verification
   * would be a reassuring zero.
   *
   * jsdom does no layout. Every element measures zero, so the virtualiser cannot tell
   * what fits on screen: measured here, it paints 159 rows of 300 and — stranger still
   * — the ones it paints are indexes 141 to 299 rather than the first screenful.
   * Handing the rows a fake height through `getBoundingClientRect` was tried and
   * changed nothing, because without layout there is nothing downstream to apply it to.
   *
   * So nothing here assumes WHICH rows are painted. What is checked is what does not
   * need layout: that it is not one row per entry, that searching reaches an entry that
   * is not painted, and that assistive technology hears the real count. **How much it
   * really trims, and what that costs, is measured in a browser by
   * `scripts/verify-large-vault.mjs`** — which is why that command was written first.
   */
  const PAINTED_AT_MOST = MANY * 0.75

  /*
   * Generous, and it is the vault being big rather than anything being slow: 300 entries
   * are really encrypted for the fixture and really decrypted by the screen. The default
   * of one second is what made the first version of these tests look like a list that
   * never painted at all.
   */
  const PATIENTLY = { timeout: 15000 }

  async function manyItems() {
    return Promise.all(
      Array.from({ length: MANY }, (_, i) =>
        encryptedItem(`item-${i}`, {
          nombre: `Servicio ${String(i).padStart(3, '0')}`,
          usuario: `persona${i}@example.test`,
          password: `clave-${i}`,
          url: '',
          notas: '',
        }),
      ),
    )
  }

  const painted = () => screen.queryAllByRole('listitem')

  /** Waits for the list without caring which rows it decided to paint. */
  async function listPainted() {
    await waitFor(() => expect(painted().length).toBeGreaterThan(0), PATIENTLY)

    return painted()
  }

  it('does not paint one row per entry', async () => {
    apiReturning(await manyItems())
    renderPage()

    expect((await listPainted()).length).toBeLessThan(PAINTED_AT_MOST)
  })

  it('finds an entry that is not painted', async () => {
    /*
     * THE TEST THIS BLOCK EXISTS FOR.
     *
     * It picks an entry the list decided NOT to paint, checks it really is absent from
     * the DOM, and then searches for it. If the search ever ran over the painted rows
     * instead of over every item, this is what would fail — and in the real vault it
     * would not fail, it would quietly hide a password from whoever went looking for it.
     */
    apiReturning(await manyItems())
    renderPage()

    const indexes = (await listPainted()).map((row) => Number(row.getAttribute('data-index')))
    const missing = Array.from({ length: MANY }, (_, i) => i).find((i) => !indexes.includes(i))
    const name = `Servicio ${String(missing).padStart(3, '0')}`

    expect(missing).toBeDefined()
    expect(screen.queryByText(name)).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), name)

    expect(await screen.findByText(name, {}, PATIENTLY)).toBeInTheDocument()
  })

  it('tells how many entries there are, and not how many are painted', async () => {
    /*
     * Otherwise a screen reader announces a list of however many rows happen to be in
     * the DOM over a vault of 300, which is not a cosmetic difference: it is the
     * difference between knowing you have reached the end and believing you have.
     */
    apiReturning(await manyItems())
    renderPage()

    const rows = await listPainted()

    expect(rows.length).toBeLessThan(PAINTED_AT_MOST)
    expect(rows[0]).toHaveAttribute('aria-setsize', String(MANY))
    // Its place in the whole vault, not its place among what is painted.
    expect(rows[0]).toHaveAttribute('aria-posinset', String(Number(rows[0].getAttribute('data-index')) + 1))
  })

  it('narrowing the search updates how many entries it says there are', async () => {
    apiReturning(await manyItems())
    renderPage()
    await listPainted()

    /*
     * «Servicio 25» matches thirteen of the 300, and getting that number wrong the first
     * time is worth writing down: the search covers the username too, so besides the
     * names 025 and 250-259 it also finds persona125 and persona225. A search that only
     * looked at the name would pass a test written for eleven.
     */
    await userEvent.type(screen.getByRole('searchbox'), 'Servicio 25')

    await waitFor(() => {
      expect(painted()[0]).toHaveAttribute('aria-setsize', '13')
    }, PATIENTLY)
  })
})

describe('the toolbar', () => {
  /*
   * The search box is the main control of this screen, and with 370 entries the page is
   * 27.532 px tall: looking something up used to mean scrolling all the way back to the
   * top first. See #351.
   *
   * As with everything decided by CSS, jsdom can only see the declaration. That it
   * really stays put, that the rows pass underneath without showing through, and that
   * it costs 18 % of a phone screen, was measured in a browser.
   */
  it('stays below the header instead of scrolling away with the list', async () => {
    apiReturning([await encryptedItem('item-1', { nombre: 'GitHub', usuario: '', password: '', url: '', notas: '' })])
    renderPage()

    const toolbar = (await screen.findByRole('searchbox')).closest('div.sticky')

    expect(toolbar).not.toBeNull()
    expect(toolbar?.className).toContain('top-14')
    expect(toolbar?.className).toContain('bg-background')
  })
})
