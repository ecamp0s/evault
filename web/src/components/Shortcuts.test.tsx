import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { useSession, type User } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { useUnsavedWork } from '@/lib/vault/unsavedWork'
import { UserMenu } from './app/UserMenu'
import { Shortcuts } from './Shortcuts'

const ADA: User = { id: 1, name: 'Ada Lovelace', email: 'ada@evault.test', created_at: null, has_recovery_key: false }

/** Any key at all: nothing is decrypted here, all that matters is that it exists. */
const SOME_KEY = {} as CryptoKey

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Shortcuts />
      <Routes>
        <Route
          path="/"
          element={
            <>
              <p>La vault</p>
              <input aria-label="Buscar" />
              <UserMenu />
            </>
          }
        />
        <Route path="/unlock" element={<p>Tu vault está bloqueada</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function expectLocked() {
  expect(screen.getByText('Tu vault está bloqueada')).toBeInTheDocument()
  expect(useVaultKey.getState().key).toBeNull()
  expect(useSession.getState().token).toBeNull()
  // Remembered, which is what makes this a lock and not a sign-out.
  expect(useSession.getState().rememberedUser).toEqual({ name: ADA.name, email: ADA.email })
}

beforeEach(() => {
  useSession.setState({ user: null, token: null, rememberedUser: null, offline: false })
  useVaultKey.setState({ key: null })
  useUnsavedWork.setState({ count: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('locking by hand', () => {
  beforeEach(() => {
    useSession.getState().authenticate(ADA, 'un-token')
    useVaultKey.setState({ key: SOME_KEY })
  })

  it('«Bloquear» in the user menu locks, and leaves the key nowhere in memory', async () => {
    renderApp()

    await userEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Bloquear/ }))

    expectLocked()
  })

  it('the menu says which keys do the same', async () => {
    renderApp()

    await userEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }))

    expect(await screen.findByRole('menuitem', { name: /Bloquear.*Ctrl\+Mayús\+L/ })).toBeInTheDocument()
  })

  it('Ctrl+Shift+L locks', async () => {
    renderApp()

    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}')

    expectLocked()
  })

  it('Ctrl+Shift+L locks with the focus inside a text field too', async () => {
    renderApp()

    await userEvent.click(screen.getByRole('textbox', { name: 'Buscar' }))
    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}')

    expectLocked()
  })

  it('a lock over unsaved work says what was discarded, as the inactivity lock does', async () => {
    const warning = vi.spyOn(toast, 'warning')
    useUnsavedWork.setState({ count: 1 })
    renderApp()

    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}')

    expectLocked()
    expect(warning).toHaveBeenCalledWith('Se ha descartado lo que estabas escribiendo, sin guardar.', expect.anything())
  })

  it('locks a vault opened offline, where there is a key and no token', async () => {
    useSession.setState({ token: null, user: null, offline: true })
    renderApp()

    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}')

    expect(screen.getByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBeNull()
  })
})

describe('with the vault locked', () => {
  it('the shortcut does nothing', async () => {
    renderApp()

    await userEvent.keyboard('{Control>}{Shift>}L{/Shift}{/Control}')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })
})
