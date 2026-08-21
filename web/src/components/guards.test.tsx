import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { RequireLocked, RequireSession, RequireNoSession } from './guards'
import { useSession, type User } from '@/lib/session'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null, has_recovery_key: false
}

/*
 * What these tests watch over is the distinction ADR-007 asks for between locking and
 * eviction. It is a product decision implemented with an `if`, and with no test any
 * future simplification would undo it without anything warning.
 */
/**
 * Shows where whoever was redirected here was coming from.
 *
 * It exists because that information travels in react-router's `state`, which is not
 * typed: it is read with a cast, so neither the compiler nor any screen warns if the key
 * stops matching the one the guard writes. It is exactly what happened when migrating
 * the identifiers to English in #117, and there was no test covering it: the promise of
 * coming back to where you were would have broken in silence.
 */
function WhereFrom() {
  const { state } = useLocation()

  return <p>Venía de: {(state as { from?: string } | null)?.from ?? 'ningún sitio'}</p>
}

function renderAt(routePath: string) {
  return render(
    <MemoryRouter initialEntries={[routePath]}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireSession>
              <p>La vault</p>
            </RequireSession>
          }
        />
        <Route
          path="/login"
          element={
            <RequireNoSession>
              <p>Formulario de entrada</p>
            </RequireNoSession>
          }
        />
        <Route
          path="/desbloquear"
          element={
            <RequireLocked>
              <p>Pantalla de desbloqueo</p>
              <WhereFrom />
            </RequireLocked>
          }
        />
        <Route path="/vault/secreta" element={<RequireSession><p>Sección concreta</p></RequireSession>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null, token: null, rememberedUser: null })
})

describe('RequireSession', () => {
  it('lets through with a token', () => {
    useSession.getState().authenticate(ADA, 'token')

    renderAt('/')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  /*
   * ADR-007's central case: reloading kills the token but not the memory of who you
   * were, and that has to lead to the unlock screen and not to the sign-in form. The
   * difference between the two screens is the difference between «se te ha bloqueado la
   * vault» and «quién eres».
   */
  it('leads to the unlock screen if the user is remembered but there is no token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/')

    expect(screen.getByText('Pantalla de desbloqueo')).toBeInTheDocument()
  })

  /*
   * Coming back to where you were is a promise of the interface, and until #117 it had
   * no net: the key travels in react-router's state, which is read with a cast.
   */
  it('remembers which route it came from when sending to the unlock screen', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/vault/secreta')

    expect(screen.getByText('Venía de: /vault/secreta')).toBeInTheDocument()
  })

  it('leads to the login if nobody is remembered', () => {
    renderAt('/')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })
})

describe('RequireLocked', () => {
  it('lets the unlock screen show when there is a remembered user and no token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/desbloquear')

    expect(screen.getByText('Pantalla de desbloqueo')).toBeInTheDocument()
  })

  it('makes no sense with the session open, so it leads to the vault', () => {
    useSession.getState().authenticate(ADA, 'token')

    renderAt('/desbloquear')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('makes no sense with no remembered account, so it leads to the login', () => {
    renderAt('/desbloquear')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })
})

describe('RequireNoSession', () => {
  it('lets the login show with no session', () => {
    renderAt('/login')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })

  /*
   * With a remembered user but no token, the login is still reachable: it is the way out
   * for somebody wanting to sign in with another account.
   */
  it('stays reachable with a remembered account but no token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/login')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })

  it('throws out whoever already has a session', () => {
    useSession.getState().authenticate(ADA, 'token')

    renderAt('/login')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })
})
