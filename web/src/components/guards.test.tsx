import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SoloBloqueada, SoloConSesion, SoloSinSesion } from './guards'
import { useSession, type User } from '@/lib/session'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

/*
 * Lo que estos tests vigilan es la distinción que pide ADR-007 entre bloqueo y
 * expulsión. Es una decisión de producto que se implementa con un `if`, y sin test
 * cualquier simplificación futura la desharía sin que nada avisara.
 */
function pintarEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route
          path="/"
          element={
            <SoloConSesion>
              <p>La vault</p>
            </SoloConSesion>
          }
        />
        <Route
          path="/login"
          element={
            <SoloSinSesion>
              <p>Formulario de entrada</p>
            </SoloSinSesion>
          }
        />
        <Route
          path="/desbloquear"
          element={
            <SoloBloqueada>
              <p>Pantalla de desbloqueo</p>
            </SoloBloqueada>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null, token: null, rememberedUser: null })
})

describe('SoloConSesion', () => {
  it('deja pasar con token', () => {
    useSession.getState().authenticate(ADA, 'token')

    pintarEn('/')

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

    pintarEn('/')

    expect(screen.getByText('Pantalla de desbloqueo')).toBeInTheDocument()
  })

  it('lleva al login si no se recuerda a nadie', () => {
    pintarEn('/')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })
})

describe('SoloBloqueada', () => {
  it('deja ver el desbloqueo cuando hay usuario recordado y no hay token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    pintarEn('/desbloquear')

    expect(screen.getByText('Pantalla de desbloqueo')).toBeInTheDocument()
  })

  it('no tiene sentido con la sesión abierta, así que lleva a la vault', () => {
    useSession.getState().authenticate(ADA, 'token')

    pintarEn('/desbloquear')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('no tiene sentido sin cuenta recordada, así que lleva al login', () => {
    pintarEn('/desbloquear')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })
})

describe('SoloSinSesion', () => {
  it('deja ver el login sin sesión', () => {
    pintarEn('/login')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })

  /*
   * Con usuario recordado pero sin token, el login sigue siendo accesible: es la
   * salida para quien quiere entrar con otra cuenta.
   */
  it('sigue accesible con una cuenta recordada pero sin token', () => {
    useSession.setState({ rememberedUser: { name: ADA.name, email: ADA.email } })

    pintarEn('/login')

    expect(screen.getByText('Formulario de entrada')).toBeInTheDocument()
  })

  it('echa de ahí a quien ya tiene sesión', () => {
    useSession.getState().authenticate(ADA, 'token')

    pintarEn('/login')

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })
})
