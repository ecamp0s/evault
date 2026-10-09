import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useGettingStarted } from '@/lib/gettingStarted'
import { createQueryClient } from '@/lib/queries'
import { useSession, type User } from '@/lib/session'
import type { AccountPasskey } from '@/lib/vault/passkeyAccount'
import { GettingStarted } from './GettingStarted'

/*
 * The getting-started card of #790. What it protects is that each step is DERIVED from the
 * account: it shows while it is true and goes away once it is not, with nothing stored but
 * the choice to hide the whole card.
 */

const ADA: User = { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null, has_recovery_key: false }

const A_PASSKEY: AccountPasskey = {
  id: 'passkey-1',
  label: 'iPhone de Ada',
  rp_id: 'evault.local',
  created_at: '2026-09-10T10:00:00+00:00',
  last_used_at: null,
}

function paint() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={createQueryClient()}>
        <Routes>
          <Route path="/" element={<GettingStarted />} />
          <Route path="/recovery-key" element={<p>Pantalla de la clave</p>} />
          <Route path="/passkeys" element={<p>Pantalla de los passkeys</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** A browser that can make passkeys, which jsdom is not. */
function withWebAuthn() {
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    writable: true,
    value: { create: vi.fn(), get: vi.fn() },
  })
}

function withPasskeys(passkeys: AccountPasskey[]) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: { data: passkeys } })
}

const signIn = (fields: Partial<User> = {}) =>
  useSession.setState({ user: { ...ADA, ...fields }, token: 'un-token', offline: false, rememberedUser: { name: ADA.name, email: ADA.email } })

beforeEach(() => {
  useGettingStarted.setState({ dismissed: [] })
  Object.defineProperty(navigator, 'credentials', { configurable: true, writable: true, value: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the recovery key step', () => {
  it('shows while the account has no recovery key, and leads to where it is made', async () => {
    signIn()
    paint()

    expect(screen.getByRole('heading', { name: 'Primeros pasos' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crear la clave' }))

    expect(screen.getByText('Pantalla de la clave')).toBeInTheDocument()
  })

  it('goes away the moment the session learns a key was registered', () => {
    signIn()
    paint()
    expect(screen.getByText('Guarda una clave de recuperación')).toBeInTheDocument()

    act(() => useSession.getState().markRecoveryKey())

    expect(screen.queryByText('Guarda una clave de recuperación')).not.toBeInTheDocument()
  })
})

describe('the passkey step', () => {
  it('shows when the browser can make one and the account has none, and leads to where it is added', async () => {
    withWebAuthn()
    withPasskeys([])
    signIn({ has_recovery_key: true })
    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Añadir un passkey' }))

    expect(screen.getByText('Pantalla de los passkeys')).toBeInTheDocument()
  })

  it('is not there when the account already has a passkey', async () => {
    withWebAuthn()
    const asked = withPasskeys([A_PASSKEY])
    signIn()
    paint()

    await waitFor(() => expect(asked).toHaveBeenCalled())
    expect(screen.getByText('Guarda una clave de recuperación')).toBeInTheDocument()
    expect(screen.queryByText('Añade un passkey')).not.toBeInTheDocument()
  })

  it('is not offered, nor asked about, where the browser cannot make a passkey', () => {
    const asked = withPasskeys([])
    signIn()
    paint()

    expect(screen.getByText('Guarda una clave de recuperación')).toBeInTheDocument()
    expect(screen.queryByText('Añade un passkey')).not.toBeInTheDocument()
    expect(asked).not.toHaveBeenCalled()
  })

  it('is left out, rather than guessed, if the list of passkeys cannot be read', async () => {
    withWebAuthn()
    const asked = vi.spyOn(api, 'get').mockRejectedValue(new Error('network'))
    signIn()
    paint()

    await waitFor(() => expect(asked).toHaveBeenCalled())
    expect(screen.queryByText('Añade un passkey')).not.toBeInTheDocument()
  })
})

describe('the card as a whole', () => {
  it('paints nothing once both steps are taken', async () => {
    withWebAuthn()
    const asked = withPasskeys([A_PASSKEY])
    signIn({ has_recovery_key: true })
    const { container } = paint()

    await waitFor(() => expect(asked).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('paints nothing offline, where whether there is a recovery key is not known', () => {
    useSession.setState({ user: null, token: null, offline: true, rememberedUser: { name: ADA.name, email: ADA.email } })
    const { container } = paint()

    expect(container).toBeEmptyDOMElement()
  })

  it('once hidden stays hidden for that account in this browser, and not for another', async () => {
    signIn()
    const { unmount } = paint()

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar los primeros pasos en este navegador' }))
    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument()
    unmount()

    paint()
    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument()

    signIn({ email: 'grace@evault.test' })
    expect(await screen.findByText('Primeros pasos')).toBeInTheDocument()
  })

  it('keeps the choice under a key in English, holding no secret', async () => {
    signIn({ email: 'Ada@Evault.test' })
    paint()

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar los primeros pasos en este navegador' }))

    expect(JSON.parse(localStorage.getItem('evault.gettingStarted') ?? '{}').state.dismissed).toEqual(['ada@evault.test'])
  })

  it('still hides when the browser refuses to store the choice', async () => {
    signIn()
    paint()
    const refused = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    // What an unguarded write does is throw out of the click: React reports it here.
    const reported: unknown[] = []
    const onError = (event: ErrorEvent) => {
      reported.push(event.error)
      event.preventDefault()
    }
    window.addEventListener('error', onError)

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar los primeros pasos en este navegador' }))
    window.removeEventListener('error', onError)

    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument()
    // It did try, so the refusal was really in the way and not skipped.
    expect(refused).toHaveBeenCalled()
    expect(reported).toEqual([])
  })

  it('reads a choice it cannot reach as no choice, and shows the card', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    await useGettingStarted.persist.rehydrate()
    signIn()
    paint()

    expect(screen.getByText('Primeros pasos')).toBeInTheDocument()
  })
})
