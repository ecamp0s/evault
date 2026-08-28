import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import * as portapapeles from '@/lib/clipboard'
import type { Item } from '@/lib/vault/types'
import { ItemDialog } from './ItemDialog'
import { ItemRow } from './ItemRow'

const ITEM: Item = {
  id: 'item-1',
  vaultId: 'vault-1',
  content: {
    nombre: 'GitHub',
    usuario: 'ada@example.com',
    password: 'secretísima',
  },
  createdAt: null,
  updatedAt: null,
}

function renderRow(item = ITEM) {
  return render(
    <>
      <ul>
        <ItemRow item={item} onEdit={vi.fn()} onDelete={vi.fn()}
      onToggleFavourite={vi.fn()} />
      </ul>
      {/* sonner only paints its notices when the Toaster is mounted. */}
      <Toaster />
    </>,
  )
}

function renderDialog(item: Item | null = ITEM) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ItemDialog vaultId="vault-1" item={item} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('copying from the list', () => {
  it('copies the password with the right value', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    renderRow()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('secretísima'))
  })

  /*
   * Copying must not become a back door to what the list does not show: the value goes
   * from the object in memory to the clipboard without passing through the DOM. It is
   * the same criterion issue #55 defends.
   */
  it('the password still does not appear in the DOM', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    const { container } = renderRow()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(container.innerHTML).not.toContain('secretísima')
  })

  it('with no stored password it offers no copy button', () => {
    renderRow({ ...ITEM, content: { nombre: 'Solo una nota' } })

    expect(screen.queryByRole('button', { name: /Copiar la contraseña/ })).not.toBeInTheDocument()
  })

  it('warns when the clipboard fails, instead of staying quiet', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('error')

    renderRow()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(await screen.findByText(/No hemos podido acceder al portapapeles/)).toBeInTheDocument()
  })

  it('confirms the copy and warns that the clipboard will be cleared', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    renderRow()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(await screen.findByText(/Se borrará del portapapeles/)).toBeInTheDocument()
  })

  /*
   * What this test defends is not lying. Without a secure context the clearing cannot
   * happen, so the notice does not mention it: promising a cleanup that is not going to
   * take place is worse than saying nothing, because the user would stop watching their
   * clipboard believing somebody does it for them.
   */
  it('does not promise the clearing when it could not be scheduled', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-without-clear')

    renderRow()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(await screen.findByText('Contraseña copiada.')).toBeInTheDocument()
    expect(screen.queryByText(/Se borrará del portapapeles/)).not.toBeInTheDocument()
  })
})

describe('copying from the detail', () => {
  it('copies the password', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copiar la contraseña' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('secretísima'))
  })

  /*
   * The username is not a secret, so no clearing is scheduled: doing it would wipe the
   * clipboard for nothing in return.
   */
  it('copia el usuario sin programar vaciado', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Copiar el usuario' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('ada@example.com', false))
  })

  it('copies what is written now, not what was saved', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    renderDialog()

    await userEvent.clear(screen.getByLabelText('Contraseña'))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la nueva sin guardar')
    await userEvent.click(screen.getByRole('button', { name: 'Copiar la contraseña' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('la nueva sin guardar'))
  })

  it('on a new and empty entry the copy buttons are disabled', () => {
    renderDialog(null)

    expect(screen.getByRole('button', { name: 'Copiar la contraseña' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copiar el usuario' })).toBeDisabled()
  })
})

describe('showing and hiding', () => {
  it('the password is hidden by default and revealed only on request', async () => {
    renderDialog()

    const field = screen.getByLabelText('Contraseña')

    expect(field).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }))

    expect(field).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la contraseña' }))

    expect(field).toHaveAttribute('type', 'password')
  })
})
