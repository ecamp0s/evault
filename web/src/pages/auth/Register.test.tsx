import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { Register } from './Register'

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSession.getState().clearSession()
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * ADR-001 demands it in writing: «There is no master password recovery. The UI must
 * communicate this unambiguously before the user creates their vault.»
 *
 * These tests exist by the rule that came out of Iteration 2: when the interface makes
 * a promise about security, the test that fails if the promise stops being true gets
 * written. Both times the interface lied in that iteration it was discovered by opening
 * the browser and not in the suite.
 *
 * Here the promise is the warning, and these tests fail if somebody removes it to make
 * the form look tidier. That is exactly the change that looks like an improvement and
 * is not.
 */
describe('the warning that there is no recovery', () => {
  it('is visible before creating the account, without interacting with anything', () => {
    renderRegister()

    expect(screen.getByRole('note')).toHaveTextContent(
      /si olvidas esta contraseña, perderás el acceso/i,
    )
  })

  it('says nobody can recover it, and not merely that one should be careful', () => {
    renderRegister()

    expect(screen.getByRole('note')).toHaveTextContent(/no podemos recuperarla ni restablecerla/i)
  })

  /*
   * Before the button, not after. A warning that appears once the user has already
   * pressed arrives late for the one thing it had to achieve: that they choose a
   * password they will not forget.
   */
  it('comes before the create account button in document order', () => {
    renderRegister()

    const notice = screen.getByRole('note')
    const button = screen.getByRole('button', { name: 'Crear cuenta' })

    expect(notice.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

describe('the sign-up screen', () => {
  it('sends nothing when the fields are empty', async () => {
    const post = vi.spyOn(api, 'post')
    renderRegister()

    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Escribe tu nombre')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  /*
   * The derivation is slow on purpose, so the button has to say it is working. If it
   * looked frozen, the user would press again or close the tab halfway through signing
   * up.
   */
  it('says it is working while it derives', async () => {
    vi.spyOn(api, 'post').mockImplementation(
      () => new Promise(() => {}) as ReturnType<typeof api.post>,
    )

    renderRegister()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ada Lovelace')
    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña larga')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'una contraseña larga')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('button', { name: /protegiendo tu vault/i })).toBeDisabled()
  })
})
