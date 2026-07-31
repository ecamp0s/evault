import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AxiosError, AxiosHeaders } from 'axios'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { Login } from './Login'

function pintarLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  )
}

/** Respuesta de error como la que devolvería la API. */
function respuestaDeError(estado: number, datos: unknown) {
  const error = new AxiosError('Request failed')
  const headers = new AxiosHeaders()

  error.response = { status: estado, statusText: '', data: datos, headers, config: { headers } }

  return error
}

beforeEach(() => {
  useSesion.getState().cerrarSesion()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pantalla de login', () => {
  it('no envía nada si los campos están vacíos', async () => {
    const post = vi.spyOn(api, 'post')
    pintarLogin()

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
      respuestaDeError(401, { message: 'Las credenciales no son válidas.' }),
    )
    pintarLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const alerta = await screen.findByRole('alert')

    expect(alerta).toHaveTextContent('El correo o la contraseña no son correctos.')
    expect(useSesion.getState().token).toBeNull()
  })

  it('avisa de forma distinta cuando la API no responde', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'))
    pintarLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se ha podido contactar con el servidor',
    )
  })

  it('guarda la sesión cuando las credenciales son correctas', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          user: { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null },
          token: 'token-nuevo',
        },
      },
    })
    pintarLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(useSesion.getState().token).toBe('token-nuevo')
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /*
   * Sin deshabilitar el botón, una doble pulsación manda dos peticiones de login
   * y emite dos tokens.
   */
  it('deshabilita el botón mientras la petición está en curso', async () => {
    let resolver: (valor: unknown) => void = () => {}
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve
      }),
    )
    pintarLogin()

    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const boton = await screen.findByRole('button', { name: /Entrando/ })
    expect(boton).toBeDisabled()

    resolver({
      data: {
        data: {
          user: { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null },
          token: 'token',
        },
      },
    })
  })
})
