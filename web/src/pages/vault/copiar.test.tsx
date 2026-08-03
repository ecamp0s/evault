import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import * as portapapeles from '@/lib/clipboard'
import type { Item } from '@/lib/vault/types'
import { DialogoDeItem } from './DialogoDeItem'
import { FilaDeItem } from './FilaDeItem'

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

function pintarFila(item = ITEM) {
  return render(
    <>
      <ul>
        <FilaDeItem item={item} onEditar={vi.fn()} onBorrar={vi.fn()} />
      </ul>
      {/* Los avisos de sonner solo se pintan si el Toaster está montado. */}
      <Toaster />
    </>,
  )
}

function pintarDialogo(item: Item | null = ITEM) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={cliente}>
      <DialogoDeItem vaultId="vault-1" item={item} onCerrar={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('copiar desde la lista', () => {
  it('copia la contraseña con el valor correcto', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    pintarFila()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('secretísima'))
  })

  /*
   * Copiar no puede convertirse en una puerta trasera para lo que la lista no
   * enseña: el valor va del objeto en memoria al portapapeles sin pasar por el
   * DOM. Es el mismo criterio que defiende el issue #55.
   */
  it('la contraseña sigue sin aparecer en el DOM', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    const { container } = pintarFila()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(container.innerHTML).not.toContain('secretísima')
  })

  it('sin contraseña guardada no ofrece el botón de copiar', () => {
    pintarFila({ ...ITEM, content: { nombre: 'Solo una nota' } })

    expect(screen.queryByRole('button', { name: /Copiar la contraseña/ })).not.toBeInTheDocument()
  })

  it('avisa cuando el portapapeles falla, en vez de callarse', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('error')

    pintarFila()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(await screen.findByText(/No hemos podido acceder al portapapeles/)).toBeInTheDocument()
  })

  it('confirma la copia y avisa de que el portapapeles se vaciará', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    pintarFila()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(await screen.findByText(/Se borrará del portapapeles/)).toBeInTheDocument()
  })

  /*
   * Lo que este test defiende es no mentir. Sin contexto seguro el vaciado no
   * puede ocurrir, así que el aviso no lo menciona: prometer una limpieza que no
   * va a suceder es peor que no decir nada, porque el usuario dejaría de vigilar
   * su portapapeles creyendo que alguien lo hace por él.
   */
  it('no promete el vaciado cuando no ha podido programarse', async () => {
    vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-without-clear')

    pintarFila()

    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar la contraseña de GitHub' }),
    )

    expect(await screen.findByText('Contraseña copiada.')).toBeInTheDocument()
    expect(screen.queryByText(/Se borrará del portapapeles/)).not.toBeInTheDocument()
  })
})

describe('copiar desde el detalle', () => {
  it('copia la contraseña', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    pintarDialogo()

    await userEvent.click(screen.getByRole('button', { name: 'Copiar la contraseña' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('secretísima'))
  })

  /*
   * El usuario no es un secreto, así que no se programa el vaciado: hacerlo
   * borraría el portapapeles sin ganar nada a cambio.
   */
  it('copia el usuario sin programar vaciado', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    pintarDialogo()

    await userEvent.click(screen.getByRole('button', { name: 'Copiar el usuario' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('ada@example.com', false))
  })

  it('copia lo que hay escrito ahora, no lo que se guardó', async () => {
    const copyToClipboard = vi.spyOn(portapapeles, 'copyToClipboard').mockResolvedValue('copied-with-clear')

    pintarDialogo()

    await userEvent.clear(screen.getByLabelText('Contraseña'))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'la nueva sin guardar')
    await userEvent.click(screen.getByRole('button', { name: 'Copiar la contraseña' }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('la nueva sin guardar'))
  })

  it('en una entrada nueva y vacía los botones de copiar están deshabilitados', () => {
    pintarDialogo(null)

    expect(screen.getByRole('button', { name: 'Copiar la contraseña' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copiar el usuario' })).toBeDisabled()
  })
})

describe('mostrar y ocultar', () => {
  it('la contraseña está oculta por defecto y se revela solo a petición', async () => {
    pintarDialogo()

    const campo = screen.getByLabelText('Contraseña')

    expect(campo).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar la contraseña' }))

    expect(campo).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar la contraseña' }))

    expect(campo).toHaveAttribute('type', 'password')
  })
})
