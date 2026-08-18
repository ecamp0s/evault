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

/** Deja el servidor listo para un desbloqueo que funciona. */
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
 * ADR-007 pide que esto se presente como un bloqueo y no como una expulsión: «el
 * usuario sigue siendo el mismo, lo que falta es la contraseña maestra». Eso no es
 * una decisión de implementación sino de qué se le dice al usuario, así que va con
 * tests: lo que hay que impedir es que alguien lo simplifique más adelante
 * convirtiéndolo otra vez en un login corriente.
 */
describe('se presenta como bloqueo y no como expulsión', () => {
  it('no pide el correo, porque ya se sabe quién es', () => {
    renderPage()

    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña maestra')).toBeInTheDocument()
  })

  it('dice de quién es la vault que está pidiendo abrir', () => {
    renderPage()

    expect(screen.getByText(/ada@evault\.test/)).toBeInTheDocument()
  })

  it('explica por qué ha pasado, en vez de dar por hecho que se entiende', () => {
    renderPage()

    expect(screen.getByText(/se borra de la memoria/i)).toBeInTheDocument()
    expect(screen.getByText(/siguen aquí, cifrados/i)).toBeInTheDocument()
  })

  it('habla de bloqueo y no de sesión caducada', () => {
    const { container } = renderPage()

    expect(screen.getByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/sesión (ha )?caducad/i)
  })
})

describe('desbloquear', () => {
  it('abre la vault con la contraseña correcta', async () => {
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

  it('no manda la contraseña maestra', async () => {
    await serverThatOpens()
    renderPage()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), MASTER)
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await vi.waitFor(() => expect(api.post).toHaveBeenCalled(), { timeout: 5_000 })

    expect(JSON.stringify(vi.mocked(api.post).mock.calls[0]?.[1])).not.toContain(MASTER)
  })

  /*
   * Aquí un 401 no es una sesión caducada —no había sesión que caducar— sino una
   * contraseña equivocada. El texto genérico habla de «el correo o la contraseña»,
   * y en esta pantalla el correo no se ha escrito.
   */
  it('dice que la contraseña no es la suya, no que fallen las credenciales', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorWithStatus(401))
    renderPage()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'la que no es')
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    const notice = await screen.findByRole('alert')

    expect(notice).toHaveTextContent(/esa no es tu contraseña maestra/i)
    expect(notice).not.toHaveTextContent(/el correo o la contraseña/i)
  })

  it('no envía nada con el campo vacío', async () => {
    const post = vi.spyOn(api, 'post')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    expect(await screen.findByText('Escribe tu contraseña maestra')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})

/*
 * La salida para el ordenador compartido y para quien tiene dos cuentas. Sin ella,
 * el correo recordado no habría forma de quitarlo desde la interfaz.
 */
describe('olvidar la cuenta', () => {
  it('borra el usuario recordado y lo quita de localStorage', async () => {
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: /olvidar esta cuenta en este dispositivo/i }),
    )

    expect(useSession.getState().rememberedUser).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })
})
