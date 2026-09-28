import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { queryKeys } from '@/lib/vault/queryKeys'
import { encryptedItem, unlockForTest } from '@/test/vault'
import { Trash } from './Trash'
import type { EncryptedTrashedItem, Item, Vault } from '@/lib/vault/types'

/*
 * The bin in the web. `ADR-018` §2.4 and issue #709.
 *
 * What this file protects: that what was deleted can be found and taken back, that
 * deleting for good takes a second, deliberate step, and that offline the screen says
 * why it has nothing instead of showing an empty bin.
 */

const EMAIL = 'ada@evault.test'
const DAY = 24 * 60 * 60 * 1000

const VAULT: Vault = {
  id: 'vault-1',
  name: 'Personal',
  is_personal: true,
  role: 'owner',
  wrapped_key: 'clave-envuelta',
  wrapped_key_iv: 'nonce',
}

let key: CryptoKey
let trash: EncryptedTrashedItem[]
let queryClient: QueryClient

/** An entry in the bin, deleted `daysAgo` and due thirty days after that. */
async function binned(id: string, name: string, daysAgo: number): Promise<EncryptedTrashedItem> {
  const deleted = Date.now() - daysAgo * DAY

  return {
    ...(await encryptedItem(key, id, { name, password: 'secreta' })),
    deleted_at: new Date(deleted).toISOString(),
    purges_at: new Date(deleted + 30 * DAY).toISOString(),
  }
}

function paint() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Trash />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** The row of an entry, by its name. */
async function rowOf(name: string): Promise<HTMLElement> {
  const label = await screen.findByText(name)

  return label.closest('div.rounded-md') as HTMLElement
}

beforeEach(async () => {
  key = await unlockForTest()
  queryClient = createQueryClient()

  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })

  trash = [await binned('gh', 'GitHub', 2), await binned('mail', 'Correo', 10)]

  vi.spyOn(api, 'get').mockImplementation((url: string) =>
    Promise.resolve(
      url === '/vaults'
        ? { data: { data: { vaults: [VAULT] } } }
        : { data: { data: { items: url.endsWith('/trash') ? trash : [] } } },
    ),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the bin shows', () => {
  it('lists what was deleted, decrypted, with how many there are', async () => {
    paint()

    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Correo')).toBeInTheDocument()
    expect(screen.getByText('2 entradas en la papelera')).toBeInTheDocument()
  })

  it('says when each one will be deleted for good, from the date the server gave', async () => {
    paint()

    const row = await rowOf('GitHub')

    // Deleted two days ago: twenty-eight left.
    expect(within(row).getByText(/Se borrará del todo el .*, dentro de 28 días\./)).toBeInTheDocument()
  })

  /*
   * The purge runs at night and the machine may have been off, so an entry can be past
   * its date and still here. «Dentro de -2 días» would read as a bug.
   */
  it('an entry already due says it goes in the next cleaning, not a date in the past', async () => {
    trash = [await binned('old', 'Antigua', 32)]

    paint()

    const row = await rowOf('Antigua')

    expect(within(row).getByText('Se borrará del todo en la próxima limpieza de la papelera.')).toBeInTheDocument()
  })

  it('an empty bin says so', async () => {
    trash = []

    paint()

    expect(await screen.findByText('La papelera está vacía.')).toBeInTheDocument()
  })

  it('offline it says why there is nothing, and asks the server nothing', async () => {
    useSession.setState({ offline: true })

    paint()

    expect(screen.getByText(/la papelera no forma parte de ella/)).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalled())
    expect(vi.mocked(api.get).mock.calls.map(([url]) => url)).not.toContain('/vaults/vault-1/trash')
    expect(screen.queryByText('La papelera está vacía.')).not.toBeInTheDocument()
  })
})

describe('restoring', () => {
  it('takes the entry back into the vault and out of the bin', async () => {
    const [github] = trash
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { item: github } } })
    const kept: Item = {
      id: 'kept',
      vaultId: VAULT.id,
      content: { name: 'Banco' },
      createdAt: null,
      updatedAt: null,
    }
    queryClient.setQueryData<Item[]>(queryKeys.items(VAULT.id), [kept])

    paint()

    await userEvent.click(within(await rowOf('GitHub')).getByRole('button', { name: 'Restaurar' }))

    expect(post).toHaveBeenCalledWith('/vaults/vault-1/trash/gh/restore')
    await waitFor(() => expect(screen.queryByText('GitHub')).not.toBeInTheDocument())

    // Back in the vault's cached list, decrypted, without asking for the whole vault.
    const items = queryClient.getQueryData<Item[]>(queryKeys.items(VAULT.id))
    expect(items?.map((item) => [item.id, item.content.name])).toEqual([
      ['kept', 'Banco'],
      ['gh', 'GitHub'],
    ])
  })

  it('when it fails, says the entry is still in the bin and keeps it there', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))

    paint()

    await userEvent.click(within(await rowOf('GitHub')).getByRole('button', { name: 'Restaurar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hemos podido conectar. La entrada sigue en la papelera.',
    )
    expect(screen.getByText('GitHub')).toBeInTheDocument()
  })
})

describe('deleting for good', () => {
  it('asks first, and sends nothing until it is confirmed', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })

    paint()

    await userEvent.click(within(await rowOf('GitHub')).getByRole('button', { name: 'Borrar del todo' }))

    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation).toHaveTextContent('no tiene vuelta atrás')
    expect(remove).not.toHaveBeenCalled()

    await userEvent.click(within(confirmation).getByRole('button', { name: 'Borrar del todo' }))

    expect(remove).toHaveBeenCalledWith('/vaults/vault-1/trash/gh')
    await waitFor(() => expect(screen.queryByText('GitHub')).not.toBeInTheDocument())
    expect(screen.getByText('Correo')).toBeInTheDocument()
  })

  it('leaving it in the bin sends nothing', async () => {
    const remove = vi.spyOn(api, 'delete')

    paint()

    await userEvent.click(within(await rowOf('GitHub')).getByRole('button', { name: 'Borrar del todo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dejarla en la papelera' }))

    expect(remove).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
  })
})
