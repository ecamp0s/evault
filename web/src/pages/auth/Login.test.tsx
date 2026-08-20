import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { Login } from './Login'

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  )
}

/** An error response like the one the API would return. */
function errorResponse(httpStatus: number, data: unknown) {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: httpStatus, statusText: '', data: data, headers, config: { headers } }

  return error
}

beforeEach(() => {
  useSession.getState().clearSession()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the login screen', () => {
  it('sends nothing when the fields are empty', async () => {
    const post = vi.spyOn(api, 'post')
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Escribe tu correo')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  /*
   * The central case: a 401 is translated into a text of our own in the banner, and not
   * into the message the API returned.
   */
  it('shows the banner when the credentials are wrong', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      errorResponse(401, { message: 'Las credenciales no son válidas.' }),
    )
    renderLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('El correo o la contraseña no son correctos.')
    expect(useSession.getState().token).toBeNull()
  })

  it('warns differently when the API does not answer', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    renderLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se ha podido contactar con el servidor',
    )
  })

  /*
   * Signing in is two steps since ADR-008, so the happy path needs both to answer: the
   * login and the vault that opens with the key /api/vaults returns. The session is not
   * published until the second finishes.
   */
  it('stores the session when the credentials are right', async () => {
    const { createVaultKey, deriveKeys } = await import('@/lib/vault/crypto')
    const { masterKey } = await deriveKeys('contraseña-larga', 'ada@evault.test')
    const { wrapped } = await createVaultKey(masterKey)

    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          user: { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null },
          token: 'token-nuevo',
        },
      },
    })
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
    renderLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(useSession.getState().token).toBe('token-nuevo')
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /*
   * The case issue #84 is named after: the server accepts the credentials and the vault
   * still does not open, because the wrapped key does not correspond to that master
   * password.
   *
   * Telling them apart matters because what the user can do differs. With bad
   * credentials they type them again; here the server has already said the password was
   * right, so retyping it leads nowhere.
   */
  it('tells a vault that does not open from wrong credentials', async () => {
    const { createVaultKey, deriveKeys } = await import('@/lib/vault/crypto')

    // Wrapped with a different password: the login will pass and the unlock will not.
    const { masterKey } = await deriveKeys('otra contraseña', 'ada@evault.test')
    const { wrapped } = await createVaultKey(masterKey)

    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          user: { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null },
          token: 'token',
        },
      },
    })
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

    renderLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const notice = await screen.findByRole('alert')

    expect(notice).toHaveTextContent(/no hemos podido abrir tu vault/i)
    expect(notice).not.toHaveTextContent(/el correo o la contraseña no son correctos/i)

    // And it does not stay inside: the session is undone rather than leaving a shut vault.
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * Without disabling the button, a double press sends two login requests and issues two
   * tokens.
   */
  it('disables the button while the request is in flight', async () => {
    let resolvePromise: (value: unknown) => void = () => {}
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve
      }),
    )
    renderLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    /*
     * The text covers both steps, signing in and opening the vault, because since
     * ADR-008 there are two and the second is the slow one: deriving costs 600.000
     * iterations on purpose, and the button has to say it is working or it will look
     * frozen.
     */
    const button = await screen.findByRole('button', { name: /Abriendo tu vault/ })
    expect(button).toBeDisabled()

    resolvePromise({
      data: {
        data: {
          user: { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null },
          token: 'token',
        },
      },
    })
  })
})

describe('arriving here straight from recovery', () => {
  /*
   * The second half of #309. Whoever lands here has just got their access back, which
   * is by definition the likeliest moment for something to have gone wrong — and the
   * key they used still opens the vault. `ADR-010` asked for this to be said where the
   * action happens rather than on a help page.
   */

  function renderAfterRecovering() {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { recovered: true } }]}>
        <Login />
      </MemoryRouter>,
    )
  }

  it('says the key that was just used still works', () => {
    renderAfterRecovering()

    expect(screen.getByText(/sigue siendo la misma/i)).toBeInTheDocument()
  })

  it('points at regenerating it', () => {
    renderAfterRecovering()

    expect(screen.getByText(/genera una nueva/i)).toBeInTheDocument()
  })

  it('says nothing of the sort on an ordinary visit', () => {
    /*
     * The half that keeps the notice worth reading. A banner on every login is a
     * banner nobody reads on the one visit it is about.
     */
    renderLogin()

    expect(screen.queryByText(/sigue siendo la misma/i)).not.toBeInTheDocument()
  })
})
