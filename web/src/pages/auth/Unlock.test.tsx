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

/*
 * Forgetting the account, and what #550 changed about it.
 *
 * It is the ONLY place in the application that deletes this device's cached copy for one
 * account, and it was painted as a `ghost` button in muted grey — announced correctly by
 * a screen reader and invisible to eyes. Whoever owns the vault had stood in front of
 * this screen many times without finding it.
 *
 * What makes it safe to show is the confirmation and not the styling, so that is what
 * these tests hold in place.
 */
describe('forgetting the account', () => {
  const forgetButton = () =>
    screen.getByRole('button', { name: /olvidar esta cuenta en este dispositivo/i })

  it('does not forget anything on the first click', async () => {
    renderPage()

    await userEvent.click(forgetButton())

    expect(useSession.getState().rememberedUser).not.toBeNull()
  })

  /*
   * THE PART THAT DECIDES, and the reason a warning here is not frightening: nothing is
   * lost. The data is on the server; what it costs is typing the email again. A
   * confirmation that only said «this cannot be undone» would be scaring somebody away
   * from an action with no real cost.
   */
  it('says nothing is lost, and what it does cost', async () => {
    renderPage()

    await userEvent.click(forgetButton())

    const dialog = screen.getByRole('alertdialog')

    expect(dialog).toHaveTextContent(/no pierdes nada/i)
    expect(dialog).toHaveTextContent(/siguen en el servidor/i)
    expect(dialog).toHaveTextContent(/escribir tu correo y tu contraseña maestra/i)
  })

  it('deletes the remembered user and removes them from localStorage when confirmed', async () => {
    renderPage()

    await userEvent.click(forgetButton())
    await userEvent.click(screen.getByRole('button', { name: 'Olvidar esta cuenta' }))

    expect(useSession.getState().rememberedUser).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })

  it('leaves it alone when it is not confirmed', async () => {
    renderPage()

    await userEvent.click(forgetButton())
    await userEvent.click(screen.getByRole('button', { name: 'Dejarlo como está' }))

    expect(useSession.getState().rememberedUser).not.toBeNull()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

/*
 * Unlocking with a passkey. See ADR-021 and issue #562.
 *
 * The screen now has two ways in and they share only where they land. What these tests
 * hold in place is the decision taken when the iteration was planned — the master
 * password is the main way in and the passkey is a shortcut behind it — and the three
 * failures that must not be told as if they were the same thing.
 */
describe('unlocking with a passkey', () => {
  const PRF_BYTES = new Uint8Array(
    Array.from({ length: 32 }, (_, index) => (index * 31 + 7) % 256),
  )

  /**
   * An authenticator that verifies the user and returns the PRF.
   *
   * `PublicKeyCredential` is stubbed as well as `navigator.credentials`, and it is not
   * belt and braces: jsdom has neither, and `isPasskeySupported` checks both — which is
   * what a page served over plain http would also fail. Stubbing only the second left
   * the button unpainted and five tests failing for a reason that had nothing to do with
   * what they were testing.
   */
  function withAuthenticator(failWith?: Error): void {
    const rawId = new Uint8Array([1, 2, 3, 4]).buffer

    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        get: vi.fn(() =>
          failWith
            ? Promise.reject(failWith)
            : Promise.resolve({
                rawId,
                getClientExtensionResults: () => ({
                  prf: { enabled: true, results: { first: PRF_BYTES.buffer } },
                }),
              }),
        ),
      },
    })
  }

  /** No WebAuthn at all: the button must not be painted. */
  function withoutWebAuthn(): void {
    vi.unstubAllGlobals()

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: undefined,
    })
  }

  beforeEach(() => {
    withAuthenticator()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers the passkey as a second way in, not as the first', () => {
    renderPage()

    // The master password keeps the focus: a shortcut is reached for, not defaulted to.
    expect(screen.getByLabelText('Contraseña maestra')).toHaveFocus()
    expect(
      screen.getByRole('button', { name: /desbloquear con un passkey/i }),
    ).toBeInTheDocument()
  })

  it('does not paint the button when the browser cannot do it', () => {
    withoutWebAuthn()

    renderPage()

    expect(
      screen.queryByRole('button', { name: /desbloquear con un passkey/i }),
    ).not.toBeInTheDocument()
  })

  /*
   * THE MAIN WAY IN MUST NOT WAIT FOR THE SHORTCUT. Found by clicking this in a real
   * browser with no authenticator: the system dialog sits there, and with the form
   * disabled the master password was unreachable until something resolved it — on the
   * one screen whose whole job is getting back in.
   */
  it('leaves the master password usable while the passkey dialog is open', async () => {
    let settle: () => void = () => {}

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: { get: vi.fn(() => new Promise(() => { settle = () => {} })) },
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /desbloquear con un passkey/i }))

    expect(screen.getByLabelText('Contraseña maestra')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeEnabled()

    settle()
  })

  it('opens the vault without the master password being typed', async () => {
    const { masterKey } = await deriveKeys(MASTER, ADA.email)
    const { wrapped, vaultKey } = await createVaultKey(masterKey)
    const { derivePasskeyKeys, rewrap } = await import('@/lib/vault/crypto')
    const { wrapKey } = await derivePasskeyKeys(PRF_BYTES, ADA.email)
    const forPasskey = await rewrap(masterKey, wrapped, wrapKey)

    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          user: ADA,
          token: 'un-token',
          vault_id: 'vault-1',
          wrapped_key: forPasskey.data,
          wrapped_key_iv: forPasskey.iv,
        },
      },
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /desbloquear con un passkey/i }))

    await vi.waitFor(() => {
      expect(useVaultKey.getState().key).not.toBeNull()
    })

    const { decrypt, encrypt } = await import('@/lib/vault/crypto')
    const saved = await encrypt(vaultKey, 'la contraseña de GitHub')

    expect(await decrypt(useVaultKey.getState().key!, saved)).toBe('la contraseña de GitHub')
    expect(useSession.getState().token).toBe('un-token')
  })

  /*
   * Dismissing Face ID is not a failure, and the screen must not say anything: the
   * person changed their mind and the password field is right there.
   */
  it('says nothing when the dialog is dismissed', async () => {
    withAuthenticator(new DOMException('cancelado', 'NotAllowedError'))
    const post = vi.spyOn(api, 'post')

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /desbloquear con un passkey/i }))

    await vi.waitFor(() => {
      expect(
        screen.getByRole('button', { name: /desbloquear con un passkey/i }),
      ).toBeEnabled()
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    expect(useVaultKey.getState().key).toBeNull()
  })

  /*
   * #578: no credential for this hostname means the passkey is intact and belongs to
   * another name. Saying it stopped existing would send somebody to register a second
   * one for a problem they do not have.
   */
  it('does not claim the passkey is gone when none is found here', async () => {
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      writable: true,
      value: {
        get: vi.fn(() =>
          Promise.resolve({
            rawId: new Uint8Array([1]).buffer,
            getClientExtensionResults: () => ({}),
          }),
        ),
      },
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /desbloquear con un passkey/i }))

    const message = await screen.findByRole('alert')

    expect(message).toHaveTextContent(/no hemos encontrado ningún passkey/i)
    expect(message).not.toHaveTextContent(/borrado|eliminado|caducado/i)
  })

  /*
   * THE ORDER: the vault opens first and the session is published afterwards. With it
   * reversed, a wrapper that does not open would leave a token with no key — a state
   * that exists legitimately on reload, where it IS the vault locking, but that here
   * would show the interface as open over nothing.
   *
   * Written because mutation said nothing else would notice: swapping the two lines left
   * all sixteen tests green.
   */
  it('publishes no session when the wrapper does not open', async () => {
    const somebodyElse = await deriveKeys('otra-contraseña-larga', ADA.email)
    const theirVault = await createVaultKey(somebodyElse.masterKey)

    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          user: ADA,
          token: 'un-token',
          vault_id: 'vault-1',
          wrapped_key: theirVault.wrapped.data,
          wrapped_key_iv: theirVault.wrapped.iv,
        },
      },
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /desbloquear con un passkey/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(useSession.getState().token).toBeNull()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('leaves the vault locked when the server refuses', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(401))

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /desbloquear con un passkey/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBeNull()
    expect(useSession.getState().token).toBeNull()
  })
})
