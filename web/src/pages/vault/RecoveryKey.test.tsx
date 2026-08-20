import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { RecoveryKey } from './RecoveryKey'
import { useSession, type User } from '@/lib/session'
import * as recovery from '@/lib/vault/recovery'
import { DecryptionError } from '@/lib/vault/crypto'
import { generateRecoveryKey } from '@/lib/vault/recoveryKey'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null, has_recovery_key: false
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <RecoveryKey />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: ADA, token: 'un-token', rememberedUser: null })
  vi.restoreAllMocks()
})

describe('before generating it', () => {
  /*
   * The key does not exist until the user has proven they can open their vault.
   * Generating it earlier would leave a secret on screen that may be of no use to them.
   */
  it('asks for the master password and shows no key yet', () => {
    renderScreen()

    expect(screen.getByLabelText('Contraseña maestra')).toBeInTheDocument()
    expect(screen.queryByTestId('recovery-key')).not.toBeInTheDocument()
  })

  it('warns that it is shown only once, before generating it', () => {
    renderScreen()

    expect(screen.getByText(/solo se enseña una vez/i)).toBeInTheDocument()
  })

  /*
   * Telling a wrong password from any other failure, which is Iteration 3's lesson: with
   * a bad password there is something to retype; with another failure there is not.
   */
  it('says the password is not theirs when the wrapper does not open', async () => {
    vi.spyOn(recovery, 'createRecoveryKey').mockRejectedValue(new DecryptionError())

    renderScreen()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'la-equivocada')
    await userEvent.click(screen.getByRole('button', { name: 'Crear la clave' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es tu contraseña maestra/i)
    expect(screen.queryByTestId('recovery-key')).not.toBeInTheDocument()
  })
})

describe('once generated', () => {
  const generated = generateRecoveryKey()

  async function generate() {
    vi.spyOn(recovery, 'createRecoveryKey').mockResolvedValue(generated)

    renderScreen()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Crear la clave' }))

    await waitFor(() => expect(screen.getByTestId('recovery-key')).toBeInTheDocument())
  }

  it('shows the key that was generated', async () => {
    await generate()

    expect(screen.getByTestId('recovery-key')).toHaveTextContent(generated.formatted)
  })

  it('says plainly what whoever holds it can do', async () => {
    await generate()

    expect(screen.getByText(/puede abrir tu vault sin saber tu contraseña maestra/i))
      .toBeInTheDocument()
  })

  /*
   * THE CENTRAL GUARANTEE OF THIS SCREEN.
   *
   * The finish button does not exist until it is confirmed. Without this, the
   * confirmation would be an ornament one skips by accident, and what is being confirmed
   * is the only plan B there is going to be.
   */
  it('does not allow finishing until it is confirmed as saved', async () => {
    await generate()

    expect(screen.getByRole('button', { name: /terminar/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('button', { name: /terminar/i })).toBeEnabled()
  })

  it('offers copying, downloading and printing', async () => {
    await generate()

    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descargar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /imprimir/i })).toBeInTheDocument()
  })

  /*
   * The key is persisted nowhere in the browser. It is the same test that has watched
   * the token since ADR-007, applied to the other secret that cannot be stored.
   */
  it('leaves no trace of the key in localStorage or sessionStorage', async () => {
    await generate()

    const withoutDashes = generated.formatted.replace(/-/g, '')

    expect(JSON.stringify(localStorage)).not.toContain(withoutDashes)
    expect(JSON.stringify(sessionStorage)).not.toContain(withoutDashes)
  })
})
