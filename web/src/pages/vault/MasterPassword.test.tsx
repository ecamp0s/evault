import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MasterPassword } from './MasterPassword'
import { useSession, type User } from '@/lib/session'
import * as masterPassword from '@/lib/vault/masterPassword'
import { DecryptionError } from '@/lib/vault/crypto'

const ADA: User = { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null, has_recovery_key: false }

function renderScreen() {
  return render(
    <MemoryRouter>
      <MasterPassword />
    </MemoryRouter>,
  )
}

async function fill(current = 'la-de-siempre', next = 'la-nueva-larga', repeated = next) {
  await userEvent.type(screen.getByLabelText('Contraseña actual'), current)
  await userEvent.type(screen.getByLabelText('Contraseña nueva'), next)
  await userEvent.type(screen.getByLabelText('Repite la nueva'), repeated)
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar la contraseña' }))
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: ADA, token: 'un-token', rememberedUser: null })
  vi.restoreAllMocks()
})

/*
 * It runs against intuition and that is why it has a test: whoever changes their
 * password suspecting a theft usually believes that cuts off every access. With the
 * recovery key that is not so, because it wraps the vault key and that does not change.
 * See ADR-010.
 */
it('warns that the recovery key will keep working', () => {
  renderScreen()

  expect(screen.getByText(/seguirá funcionando/i)).toBeInTheDocument()
})

it('repeats the warning that there is no way to recover the password', () => {
  renderScreen()

  expect(screen.getByText(/no podemos restablecerla/i)).toBeInTheDocument()
})

describe('changing it', () => {
  it('sends the current one and the new one', async () => {
    const change = vi.spyOn(masterPassword, 'changeMasterPassword').mockResolvedValue(undefined)

    renderScreen()
    await fill()

    expect(change).toHaveBeenCalledWith('ada@evault.test', 'la-de-siempre', 'la-nueva-larga')
  })

  it('demands that both new ones match', async () => {
    const change = vi.spyOn(masterPassword, 'changeMasterPassword')

    renderScreen()
    await fill('la-de-siempre', 'la-nueva-larga', 'otra-distinta')

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('demands a minimum length for the new one', async () => {
    const change = vi.spyOn(masterPassword, 'changeMasterPassword')

    renderScreen()
    await fill('la-de-siempre', 'corta', 'corta')

    expect(await screen.findByText(/mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  /*
   * A wrong current password is recognised because the wrapper does not open, and that
   * happens in the client before anything is sent. The message says so outright, instead
   * of the generic «it could not be done».
   */
  it('says the current one is not theirs when the wrapper does not open', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockRejectedValue(new DecryptionError())

    renderScreen()
    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es tu contraseña actual/i)
  })

  /*
   * THE COSTLIEST FAILURE OF THIS SCREEN.
   *
   * Saying «changed» when the request has failed leaves the user believing their
   * password is one it is not, and on the next session thinking they have lost the
   * vault. The message only appears after the server's confirmation.
   */
  it('does not say it was changed when the request fails', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockRejectedValue(new Error('500'))

    renderScreen()
    await fill()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/contraseña cambiada/i)).not.toBeInTheDocument()
  })

  it('confirms only once the server has said yes', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockResolvedValue(undefined)

    renderScreen()
    await fill()

    expect(await screen.findByText(/contraseña cambiada/i)).toBeInTheDocument()
  })

  /*
   * The other sessions falling is half the reason the operation exists, so the screen
   * says it instead of letting it be discovered.
   */
  it('says the other sessions have been closed', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockResolvedValue(undefined)

    renderScreen()
    await fill()

    expect(await screen.findByText(/otros dispositivos se han cerrado/i)).toBeInTheDocument()
  })
})
