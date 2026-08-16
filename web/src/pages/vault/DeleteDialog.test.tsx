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
   * Un «¿estás seguro?» genérico no ayuda a decidir. Con varias entradas
   * parecidas, lo único que evita borrar la equivocada es ver cuál es.
   */
  it('nombra la entrada concreta que se va a borrar', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /GitHub/ })).toBeInTheDocument()
  })

  it('avisa de que no hay vuelta atrás', () => {
    renderPage()

    expect(screen.getByText(/no tiene vuelta atrás/i)).toBeInTheDocument()
  })

  it('cancelar no borra nada', async () => {
    const remove = vi.spyOn(api, 'delete')
    const { onClose } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(remove).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('confirmar borra la entrada correcta', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: null })
    const { onClose } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    /*
     * Mismo orden que en ItemDialog y por el mismo motivo: se espera al cierre, que
     * ocurre en el callback de éxito de la mutación, y después se comprueba la
     * llamada que lo provocó. Ver el issue #186.
     */
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(remove).toHaveBeenCalledWith(`/vaults/${VAULT_ID}/items/item-1`)
  })

  /*
   * Si el diálogo se cerrara al fallar, el usuario vería su entrada seguir en la
   * lista sin saber si el borrado ha ocurrido o no.
   */
  it('un error deja el diálogo abierto y lo dice', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(apiError(500))
    const { onClose } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('sigue guardada')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
  })

  it('distingue el fallo de red', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new AxiosError('Network Error'))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido conectar')
  })

  it('la contraseña no aparece en el diálogo', () => {
    const { container } = renderPage()

    expect(container.innerHTML).not.toContain('secretísima')
  })
})
