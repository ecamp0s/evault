import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { DecryptionError } from '@/lib/vault/crypto'
import * as deleting from '@/lib/vault/deleteAccount'
import { DeleteAccount } from './DeleteAccount'

/*
 * The screen of ADR-024 (#715). The deletion itself is `deleteAccount`'s, with its own
 * tests on real cryptography; what this file protects is what the screen says before
 * asking, and that the button stays shut until the email is typed.
 */

const EMAIL = 'ada@evault.test'

function paint() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <DeleteAccount />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const button = () => screen.getByRole('button', { name: 'Borrar mi cuenta para siempre' })

async function fill(email: string, password: string) {
  if (email) await userEvent.type(screen.getByLabelText(/Escribe tu correo/), email)
  if (password) await userEvent.type(screen.getByLabelText('Contraseña maestra'), password)
}

beforeEach(() => {
  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what it says before asking', () => {
  it('says everything goes, and that there is no way back', () => {
    paint()

    expect(screen.getByText(/también las de la\s+papelera/)).toBeInTheDocument()
    expect(screen.getByText('No tiene vuelta atrás')).toBeInTheDocument()
  })

  it('offers to export first', () => {
    paint()

    expect(screen.getByText('expórtalas antes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'vault' })).toHaveAttribute('href', '/')
  })

  /* ADR-024 §2.3: the three things the server cannot reach, said before and not after. */
  it('names the three things it cannot delete', () => {
    paint()

    expect(screen.getByText('Las copias de seguridad')).toBeInTheDocument()
    expect(screen.getByText('La copia sin conexión de otros dispositivos')).toBeInTheDocument()
    expect(screen.getByText(/Olvidar\s+esta cuenta en este dispositivo/)).toBeInTheDocument()
    expect(screen.getByText('Tus passkeys')).toBeInTheDocument()
  })
})

describe('the confirmation', () => {
  it('stays shut until the account email and the master password are both there', async () => {
    paint()

    expect(button()).toBeDisabled()

    await fill('otra@evault.test', 'maestra')
    expect(button()).toBeDisabled()

    await userEvent.clear(screen.getByLabelText(/Escribe tu correo/))
    await fill(EMAIL, '')
    expect(button()).toBeEnabled()
  })

  it('compares the email as the login does: capitals and spaces do not count', async () => {
    paint()

    await fill('  ADA@Evault.test ', 'maestra')

    expect(button()).toBeEnabled()
  })

  it('offline it is not offered, and says why', () => {
    useSession.setState({ offline: true })

    paint()

    expect(screen.getByText(/no se puede borrar la cuenta/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar mi cuenta para siempre' })).not.toBeInTheDocument()
  })
})

describe('deleting', () => {
  it('sends the account email for the derivation, and what was typed as the confirmation', async () => {
    const remove = vi.spyOn(deleting, 'deleteAccount').mockResolvedValue()

    paint()
    await fill('ADA@evault.test', 'maestra')
    await userEvent.click(button())

    expect(remove).toHaveBeenCalledWith(EMAIL, 'ADA@evault.test', 'maestra')
  })

  it.each([
    [new DecryptionError(), 'Esa no es tu contraseña maestra. No se ha borrado nada.'],
    [new ApiError(null, {}, 'no network'), 'No hemos podido conectar. No se ha borrado nada.'],
    [new ApiError(429, {}, 'too many'), /Demasiados intentos.*No se ha borrado nada\./],
  ])('says what failed and that nothing was deleted', async (failure, message) => {
    vi.spyOn(deleting, 'deleteAccount').mockRejectedValue(failure)

    paint()
    await fill(EMAIL, 'maestra')
    await userEvent.click(button())

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    await waitFor(() => expect(button()).toBeEnabled())
  })
})
