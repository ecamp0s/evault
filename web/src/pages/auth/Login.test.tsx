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

/** Respuesta de error como la que devolvería la API. */
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

describe('pantalla de login', () => {
  it('no envía nada si los campos están vacíos', async () => {
    const post = vi.spyOn(api, 'post')
    renderLogin()

    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Escribe tu correo')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  /*
   * El caso central: un 401 se traduce a un texto propio en el banner, y no al
   * message que devolvió la API.
   */
  it('muestra el banner cuando las credenciales son incorrectas', async () => {
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

  it('avisa de forma distinta cuando la API no responde', async () => {
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
   * Entrar son dos pasos desde ADR-008, así que el escenario feliz necesita que los
   * dos respondan: el login y la vault que se abre con la clave que devuelve
   * /api/vaults. La sesión no se publica hasta que el segundo termina.
   */
  it('guarda la sesión cuando las credenciales son correctas', async () => {
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
   * El caso que da nombre al issue #84: el servidor acepta las credenciales y aun
   * así la vault no se abre, porque la clave envuelta no corresponde a esa
   * contraseña maestra.
   *
   * Que se distinga importa porque lo que puede hacer el usuario es distinto. Con
   * credenciales malas vuelve a escribirlas; aquí el servidor ya ha dicho que la
   * contraseña era la buena, así que reescribirla no lleva a ninguna parte.
   */
  it('distingue una vault que no abre de unas credenciales incorrectas', async () => {
    const { createVaultKey, deriveKeys } = await import('@/lib/vault/crypto')

    // Envuelta con otra contraseña: el login pasará y el desbloqueo no.
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

    // Y no se queda dentro: la sesión se deshace en vez de dejar una vault cerrada.
    expect(useSession.getState().token).toBeNull()
  })

  /*
   * Sin deshabilitar el botón, una doble pulsación manda dos peticiones de login
   * y emite dos tokens.
   */
  it('deshabilita el botón mientras la petición está en curso', async () => {
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
     * El texto cubre los dos pasos, entrar y abrir la vault, porque desde ADR-008
     * son dos y el segundo es el que tarda: derivar cuesta 600.000 iteraciones a
     * propósito, y el botón tiene que decir que está trabajando o parecerá colgado.
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
