import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import type { Item } from '@/lib/vault/types'
import { DeleteDialog } from './DeleteDialog'

const VAULT_ID = 'vault-1'

const ITEM: Item = {
  id: 'item-1',
  vaultId: VAULT_ID,
  content: { nombre: 'GitHub', usuario: 'ada@example.com', password: 'secretísima' },
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

describe('DialogoDeBorrado', () => {
  /*
   * A generic «are you sure?» does not help decide. With several similar entries, the
   * only thing that prevents deleting the wrong one is seeing which it is.
   */
  it('names the specific entry about to be deleted', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /GitHub/ })).toBeInTheDocument()
  })

  it('warns that there is no way back', () => {
    renderPage()

    expect(screen.getByText(/no tiene vuelta atrás/i)).toBeInTheDocument()
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
