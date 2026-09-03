import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useSession, type User } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { createVaultKey, deriveKeys } from '@/lib/vault/crypto'
import { Unlock } from './Unlock'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null, has_recovery_key: false
}

const MASTER = 'una contraseña maestra larga'

function renderPage() {
  return render(
    <MemoryRouter>
      <Unlock />
    </MemoryRouter>,
  )
}

function errorWithStatus(httpStatus: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: {}, headers, config: { headers } }

  return error
}

/** Leaves the server ready for an unlock that works. */
async function serverThatOpens() {
  const { masterKey } = await deriveKeys(MASTER, ADA.email)
  const { wrapped } = await createVaultKey(masterKey)

  vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { user: ADA, token: 'token' } } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      data: {
        vaults: [
          {
            id: 'vault-1',
            name: 'Personal',
            is_personal: true,
            role: 'owner',
            wrapped_key: wrapped.data,
            wrapped_key_iv: wrapped.iv,
          },
        ],
      },
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({
    user: null,
    token: null,
    rememberedUser: { name: ADA.name, email: ADA.email },
  })
  useVaultKey.setState({ key: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/*
 * ADR-007 asks for this to be presented as a lock and not as an eviction: «the user is
 * still the same, what is missing is the master password». That is not an
 * implementation decision but one of what the user is told, so it comes with tests:
 * what has to be prevented is somebody simplifying it later back into an ordinary
 * login.
 */
describe('it presents itself as a lock and not as an eviction', () => {
  it('does not ask for the email, because it already knows who they are', () => {
    renderPage()

    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña maestra')).toBeInTheDocument()
  })

  it('says whose vault it is asking to open', () => {
    renderPage()

    expect(screen.getByText(/ada@evault\.test/)).toBeInTheDocument()
  })

  it('explains why it happened, instead of taking for granted that it is understood', () => {
    renderPage()

    expect(screen.getByText(/se borra de la memoria/i)).toBeInTheDocument()
    expect(screen.getByText(/siguen aquí, cifrados/i)).toBeInTheDocument()
  })

  it('talks about a lock and not about an expired session', () => {
    const { container } = renderPage()

    expect(screen.getByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/sesión (ha )?caducad/i)
  })
})

describe('unlocking', () => {
  it('opens the vault with the right password', async () => {
    await serverThatOpens()
    renderPage()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), MASTER)
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    // vi.waitFor keeps its own 1s budget: neither testTimeout nor Testing
    // Library's asyncUtilTimeout reach it. This wait covers a real PBKDF2
    // derivation, so it needs the same headroom as the rest. See #259.
    await vi.waitFor(
      () => {
        expect(useVaultKey.getState().key).not.toBeNull()
      },
      { timeout: 5_000 },
    )

    expect(useSession.getState().token).toBe('token')
  })

  it('does not send the master password', async () => {
    await serverThatOpens()
    renderPage()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), MASTER)
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await vi.waitFor(() => expect(api.post).toHaveBeenCalled(), { timeout: 5_000 })

    expect(JSON.stringify(vi.mocked(api.post).mock.calls[0]?.[1])).not.toContain(MASTER)
  })

  /*
   * Here a 401 is not an expired session — there was no session to expire — but a wrong
   * password. The generic text talks about «the email or the password», and on this
   * screen the email has not been typed.
   */
  it('says the password is not theirs, not that the credentials are failing', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(401))
    renderPage()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'la que no es')
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    const notice = await screen.findByRole('alert')

    expect(notice).toHaveTextContent(/esa no es tu contraseña maestra/i)
    expect(notice).not.toHaveTextContent(/el correo o la contraseña/i)
  })

  it('sends nothing with the field empty', async () => {
    const post = vi.spyOn(api, 'post')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    expect(await screen.findByText('Escribe tu contraseña maestra')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})

/*
 * The way out for the shared computer and for whoever has two accounts. Without it,
 * there would be no way to remove the remembered email from the interface.
 */
/*
 * The connection probe lives in `ConnectionWarning` and has its own tests. What belongs
 * here is the one promise that is about this screen rather than that component: the form
 * never waits for it. See #492.
 */
describe('the connection probe', () => {
  it('does not hold up the form', () => {
    // A probe that never answers, which is the worst case a slow server can produce.
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => {}) as never)

    renderPage()

    // No `await`: if the field is not there synchronously, something is waiting on it.
    expect(screen.getByLabelText(/contraseña maestra/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /desbloquear/i })).toBeInTheDocument()
  })
})

describe('forgetting the account', () => {
  it('deletes the remembered user and removes them from localStorage', async () => {
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: /olvidar esta cuenta en este dispositivo/i }),
    )

    expect(useSession.getState().rememberedUser).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })
})
