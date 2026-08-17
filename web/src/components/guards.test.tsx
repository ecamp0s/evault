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
 * Lo que estos tests vigilan es la distinción que pide ADR-007 entre bloqueo y
 * expulsión. Es una decisión de producto que se implementa con un `if`, y sin test
 * cualquier simplificación futura la desharía sin que nada avisara.
 */
/**
 * Enseña de dónde venía quien fue redirigido aquí.
 *
 * Existe porque esa información viaja en el `state` de react-router, que no está
 * tipado: se lee con un cast, así que ni el compilador ni ninguna pantalla avisan
 * si la clave deja de coincidir con la que escribe el guard. Es justo lo que pasó
 * al migrar los identificadores a inglés en #117, y no había ningún test que lo
 * cubriera: la promesa de volver a donde estabas se habría roto en silencio.
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
  it('deja pasar con token', () => {
    useSession.getState().authenticate(ADA, 'token')

    renderAt('/')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  /*
   * El caso central de ADR-007: recargar mata el token pero no el recuerdo de quién
   * eras, y eso tiene que llevar al desbloqueo y no al formulario de entrada. La
   * diferencia entre las dos pantallas es la diferencia entre «se te ha bloqueado
   * la vault» y «quién eres».
   */
  it('lleva al desbloqueo si se recuerda al usuario pero no hay token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/')

    expect(screen.getByText('Pantalla de desbloqueo')).toBeInTheDocument()
  })

  /*
   * Volver a donde estabas es una promesa de la interfaz, y hasta #117 no tenía
   * red: la clave viaja en el state de react-router, que se lee con un cast.
   */
  it('recuerda de qué ruta venía al mandar al desbloqueo', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/vault/secreta')

    expect(screen.getByText('Venía de: /vault/secreta')).toBeInTheDocument()
  })

  it('lleva al login si no se recuerda a nadie', () => {
    renderAt('/')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })
})

describe('RequireLocked', () => {
  it('deja ver el desbloqueo cuando hay usuario recordado y no hay token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/desbloquear')

    expect(screen.getByText('Pantalla de desbloqueo')).toBeInTheDocument()
  })

  it('no tiene sentido con la sesión abierta, así que lleva a la vault', () => {
    useSession.getState().authenticate(ADA, 'token')

    renderAt('/desbloquear')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('no tiene sentido sin cuenta recordada, así que lleva al login', () => {
    renderAt('/desbloquear')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })
})

describe('RequireNoSession', () => {
  it('deja ver el login sin sesión', () => {
    renderAt('/login')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })

  /*
   * Con usuario recordado pero sin token, el login sigue siendo accesible: es la
   * salida para quien quiere entrar con otra cuenta.
   */
  it('sigue accesible con una cuenta recordada pero sin token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    renderAt('/login')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })

  it('echa de ahí a quien ya tiene sesión', () => {
    useSession.getState().authenticate(ADA, 'token')

    renderAt('/login')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })
})
