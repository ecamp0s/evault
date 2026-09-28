import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/vault/queryKeys'
import { encryptedItem, unlockForTest } from '@/test/vault'
import type { Item } from '@/lib/vault/types'
import { DeleteDialog } from './DeleteDialog'

const VAULT_ID = 'vault-1'

const ITEM: Item = {
  id: 'item-1',
  vaultId: VAULT_ID,
  content: { name: 'GitHub', username: 'ada@example.com', password: 'secretísima' },
  createdAt: null,
  updatedAt: null,
}

function apiError(httpStatus: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: {}, headers, config: { headers } }

  return error
}

function renderPage(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <DeleteDialog vaultId={VAULT_ID} item={ITEM} onClose={onClose} />
    </QueryClientProvider>,
  )

  return { ...utils, onClose }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('DeleteDialog', () => {
  /*
   * A generic «are you sure?» does not help decide. With several similar entries, the
   * only thing that prevents deleting the wrong one is seeing which it is.
   */
  it('names the specific entry about to be deleted', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /GitHub/ })).toBeInTheDocument()
  })

  // Since #707 there is a way back, and the dialog says where it is instead of that
  // there is none. The old sentence must not survive: it would now be a lie.
  it('says the entry goes to the bin, and no longer that there is no way back', () => {
    renderPage()

    expect(screen.getByText(/irá a la papelera/i)).toBeInTheDocument()
    expect(screen.queryByText(/no tiene vuelta atrás/i)).not.toBeInTheDocument()
  })

  it('cancelling deletes nothing', async () => {
    const remove = vi.spyOn(api, 'delete')
    const { onClose } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(remove).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('confirming deletes the right entry', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: null })
    const { onClose } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    /*
     * The same order as in ItemDialog and for the same reason: it waits for the close,
     * which happens in the mutation's success callback, and only then checks the call
     * that caused it. See issue #186.
     */
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(remove).toHaveBeenCalledWith(`/vaults/${VAULT_ID}/items/item-1`)
  })

  /*
   * Were the dialog to close on failure, the user would see their entry still in the
   * list without knowing whether the deletion happened or not.
   */
  it('an error leaves the dialog open and says so', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(apiError(500))
    const { onClose } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('sigue guardada')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
  })

  it('tells a network failure apart', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new AxiosError('Network Error'))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar')
  })

  it('the password does not appear in the dialog', () => {
    const { container } = renderPage()

    expect(container.innerHTML).not.toContain('secretísima')
  })
})

/*
 * «Deshacer» right after deleting (#710). The notice outlives the dialog, so these render
 * the Toaster beside it, and a row with the entry's id where the list would put it back.
 */
describe('undoing a deletion', () => {
  let queryClient: QueryClient
  let key: CryptoKey

  /** The list around the dialog: it unmounts it on closing, as `ItemList` does. */
  function Harness() {
    const [open, setOpen] = useState(true)

    return (
      <>
        <ul>
          <li data-item-id={ITEM.id}>
            <button type="button">Editar GitHub</button>
          </li>
        </ul>
        {open && <DeleteDialog vaultId={VAULT_ID} item={ITEM} onClose={() => setOpen(false)} />}
        <Toaster />
      </>
    )
  }

  function renderWithNotices() {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    )
  }

  async function deleteIt() {
    vi.spyOn(api, 'delete').mockResolvedValue({ data: null })
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    return screen.findByRole('button', { name: 'Deshacer' })
  }

  beforeEach(async () => {
    key = await unlockForTest()
    // sonner captures the pointer when a notice is pressed, and jsdom has no pointer
    // capture: without this every click on «Deshacer» throws outside the test.
    HTMLElement.prototype.setPointerCapture ??= () => {}
  })

  it('the notice after deleting offers to undo it', async () => {
    renderWithNotices()

    expect(await deleteIt()).toBeInTheDocument()
    expect(screen.getByText('«GitHub» está en la papelera.')).toBeInTheDocument()
  })

  it('undoing restores the same entry from the bin and puts it back in the list', async () => {
    const restored = await encryptedItem(key, ITEM.id, ITEM.content)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { item: restored } } })
    renderWithNotices()

    await userEvent.click(await deleteIt())

    expect(post).toHaveBeenCalledWith(`/vaults/${VAULT_ID}/trash/${ITEM.id}/restore`)
    expect(await screen.findByText('«GitHub» ha vuelto a la vault.')).toBeInTheDocument()
    expect(queryClient.getQueryData<Item[]>(queryKeys.items(VAULT_ID))?.map((item) => item.id)).toEqual([
      ITEM.id,
    ])
  })

  /*
   * After a deletion the focus is already lost, because what opened the dialog was the
   * deleted row. Undoing with the keyboard must not leave it at the top of the page.
   */
  it('gives the focus back to the entry that came back', async () => {
    const restored = await encryptedItem(key, ITEM.id, ITEM.content)
    vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { item: restored } } })
    renderWithNotices()

    await userEvent.click(await deleteIt())

    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar GitHub' })).toHaveFocus())
  })

  it('when undoing fails, says where the entry is', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
    renderWithNotices()

    await userEvent.click(await deleteIt())

    expect(
      await screen.findByText(/No se ha podido deshacer\. «GitHub» sigue en la papelera/),
    ).toBeInTheDocument()
  })

  it('a deletion that did not happen offers nothing to undo', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(apiError(500))
    renderWithNotices()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('sigue guardada')
    expect(screen.queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
  })
})
