import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useSesion, type Usuario } from '@/lib/sesion'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { createVaultKey, deriveKeys } from '@/lib/vault/crypto'
import { Desbloquear } from './Desbloquear'

const ADA: Usuario = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

const MAESTRA = 'una contraseña maestra larga'

function pintar() {
  return render(
    <MemoryRouter>
      <Desbloquear />
    </MemoryRouter>,
  )
}

function errorConEstado(estado: number): AxiosError {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: {}, headers, config: { headers } }

  return error
}

/** Deja el servidor listo para un desbloqueo que funciona. */
async function servidorQueAbre() {
  const { masterKey } = await deriveKeys(MAESTRA, ADA.email)
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
  useSesion.setState({
    usuario: null,
    token: null,
    usuarioRecordado: { name: ADA.name, email: ADA.email },
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
    pintar()

    expect(screen.queryByLabelText('Correo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña maestra')).toBeInTheDocument()
  })

  it('dice de quién es la vault que está pidiendo abrir', () => {
    pintar()

    expect(screen.getByText(/ada@evault\.test/)).toBeInTheDocument()
  })

  it('explica por qué ha pasado, en vez de dar por hecho que se entiende', () => {
    pintar()

    expect(screen.getByText(/se borra de la memoria/i)).toBeInTheDocument()
    expect(screen.getByText(/siguen aquí, cifrados/i)).toBeInTheDocument()
  })

  it('habla de bloqueo y no de sesión caducada', () => {
    const { container } = pintar()

    expect(screen.getByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/sesión (ha )?caducad/i)
  })
})

describe('desbloquear', () => {
  it('abre la vault con la contraseña correcta', async () => {
    await servidorQueAbre()
    pintar()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), MAESTRA)
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await vi.waitFor(() => {
      expect(useVaultKey.getState().key).not.toBeNull()
    })

    expect(useSesion.getState().token).toBe('token')
  })

  it('no manda la contraseña maestra', async () => {
    await servidorQueAbre()
    pintar()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), MAESTRA)
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await vi.waitFor(() => expect(api.post).toHaveBeenCalled())

    expect(JSON.stringify(vi.mocked(api.post).mock.calls[0]?.[1])).not.toContain(MAESTRA)
  })

  /*
   * Aquí un 401 no es una sesión caducada —no había sesión que caducar— sino una
   * contraseña equivocada. El texto genérico habla de «el correo o la contraseña»,
   * y en esta pantalla el correo no se ha escrito.
   */
  it('dice que la contraseña no es la suya, no que fallen las credenciales', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(errorConEstado(401))
    pintar()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'la que no es')
    await userEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    const aviso = await screen.findByRole('alert')

    expect(aviso).toHaveTextContent(/esa no es tu contraseña maestra/i)
    expect(aviso).not.toHaveTextContent(/el correo o la contraseña/i)
  })

  it('no envía nada con el campo vacío', async () => {
    const post = vi.spyOn(api, 'post')
    pintar()

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
    pintar()

    await userEvent.click(
      screen.getByRole('button', { name: /olvidar esta cuenta en este dispositivo/i }),
    )

    expect(useSesion.getState().usuarioRecordado).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('ada@evault.test')
  })
})
