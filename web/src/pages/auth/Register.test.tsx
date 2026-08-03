import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { Register } from './Register'

function pintarRegistro() {
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
 * ADR-001 lo exige por escrito: «No hay recuperación de contraseña maestra. La UI
 * debe comunicarlo de forma inequívoca antes de que el usuario cree su vault.»
 *
 * Estos tests existen por la regla que salió de la Iteración 2: cuando la interfaz
 * hace una promesa sobre seguridad, se escribe el test que falla si la promesa deja
 * de ser cierta. Las dos veces que la interfaz mintió en aquella iteración se
 * descubrieron abriendo el navegador y no en la suite.
 *
 * Aquí la promesa es la advertencia, y estos tests fallan si alguien la quita para
 * que el formulario quede más limpio. Es exactamente el cambio que parece una
 * mejora y no lo es.
 */
describe('el aviso de que no hay recuperación', () => {
  it('se ve antes de crear la cuenta, sin interactuar con nada', () => {
    pintarRegistro()

    expect(screen.getByRole('note')).toHaveTextContent(
      /si olvidas esta contraseña, perderás el acceso/i,
    )
  })

  it('dice que nadie puede recuperarla, y no solo que hay que tener cuidado', () => {
    pintarRegistro()

    expect(screen.getByRole('note')).toHaveTextContent(/no podemos recuperarla ni restablecerla/i)
  })

  /*
   * Antes del botón, no después. Un aviso que aparece cuando el usuario ya ha
   * pulsado llega tarde para lo único que tenía que conseguir: que elija una
   * contraseña que no vaya a olvidar.
   */
  it('está antes del botón de crear cuenta en el orden del documento', () => {
    pintarRegistro()

    const aviso = screen.getByRole('note')
    const boton = screen.getByRole('button', { name: 'Crear cuenta' })

    expect(aviso.compareDocumentPosition(boton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

describe('pantalla de registro', () => {
  it('no envía nada si los campos están vacíos', async () => {
    const post = vi.spyOn(api, 'post')
    pintarRegistro()

    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Escribe tu nombre')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  /*
   * La derivación tarda a propósito, así que el botón tiene que decir que está
   * trabajando. Si pareciera congelado, el usuario pulsaría otra vez o cerraría la
   * pestaña a medio registro.
   */
  it('avisa de que está trabajando mientras deriva', async () => {
    vi.spyOn(api, 'post').mockImplementation(
      () => new Promise(() => {}) as ReturnType<typeof api.post>,
    )

    pintarRegistro()

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ada Lovelace')
    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña larga')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'una contraseña larga')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('button', { name: /protegiendo tu vault/i })).toBeDisabled()
  })
})
