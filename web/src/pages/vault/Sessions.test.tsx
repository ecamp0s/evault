import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { useSession } from '@/lib/session'
import type { OpenSession } from '@/lib/sessions'
import { Sessions } from './Sessions'

/*
 * The account's open sessions (ADR-018 §2.5, #712). What this file protects: that the
 * web and the extension are told apart, that the session in use cannot be closed from
 * here, that closing the others is one gesture that says how many it closed, and that
 * the screen says what closing does NOT cover.
 */

const EMAIL = 'ada@evault.test'

const session = (id: number, client: OpenSession['client'], current = false): OpenSession => ({
  id,
  client,
  created_at: '2026-09-28T08:00:00+00:00',
  last_used_at: '2026-09-28T09:30:00+00:00',
  expires_at: '2026-09-28T20:00:00+00:00',
  current,
})

let sessions: OpenSession[]

function paint() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <Sessions />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** The card of a session, by the name it is shown with. */
async function cardOf(name: RegExp): Promise<HTMLElement> {
  const label = await screen.findByText(name)

  return label.closest('div.rounded-md') as HTMLElement
}

beforeEach(() => {
  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })

  sessions = [session(1, 'web', true), session(2, 'extension'), session(3, null), session(4, 'extension-firefox')]

  vi.spyOn(api, 'get').mockImplementation(() => Promise.resolve({ data: { data: sessions } }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the screen shows', () => {
  it('names each client, and says the one of a build that did not say it is unidentified', async () => {
    paint()

    expect(await screen.findByText(/^Navegador/)).toBeInTheDocument()
    expect(screen.getByText('Extensión de Chrome')).toBeInTheDocument()
    expect(screen.getByText('Extensión de Firefox')).toBeInTheDocument()
    expect(screen.getByText('Sin identificar')).toBeInTheDocument()
    expect(screen.getByText('4 sesiones abiertas')).toBeInTheDocument()
  })

  it('marks the one in use and offers no way to close it from here', async () => {
    paint()

    const current = await cardOf(/^Navegador/)

    expect(current).toHaveTextContent('la que estás usando')
    expect(within(current).queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument()
    expect(within(await cardOf(/^Extensión de Chrome/)).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('says when each one was last used and when it expires, with the time', async () => {
    paint()

    const extension = await cardOf(/^Extensión de Chrome/)

    expect(extension).toHaveTextContent(/Usada por última vez el 28 de septiembre a las \d\d:\d\d/)
    expect(extension).toHaveTextContent(/Caduca el 28 de septiembre a las \d\d:\d\d/)
  })

  /*
   * The sentence that has to be here and not in a document: closing sessions does not
   * stop anybody coming back with a passkey or the recovery key.
   */
  it('says what closing does not cover, with the way to each of the other doors', async () => {
    paint()

    expect(screen.getByText(/no le impide volver a entrar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'passkeys' })).toHaveAttribute('href', '/passkeys')
    expect(screen.getByRole('link', { name: 'clave de recuperación' })).toHaveAttribute('href', '/recovery-key')
    expect(screen.getByRole('link', { name: 'contraseña maestra' })).toHaveAttribute('href', '/master-password')
  })

  it('with only the one in use, does not offer to close the others', async () => {
    sessions = [session(1, 'web', true)]

    paint()

    expect(await screen.findByText('1 sesión abierta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar las demás sesiones' })).not.toBeInTheDocument()
  })

  it('offline it says why, and asks the server nothing', () => {
    useSession.setState({ offline: true })

    paint()

    expect(screen.getByText(/no se pueden ver ni cerrar sesiones/)).toBeInTheDocument()
    expect(vi.mocked(api.get)).not.toHaveBeenCalled()
  })
})

describe('closing', () => {
  it('closes all the others in one go and says how many', async () => {
    const remove = vi.spyOn(api, 'delete').mockImplementation(() => {
      sessions = [session(1, 'web', true)]
      return Promise.resolve({ data: { data: { closed: 2 } } })
    })

    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar las demás sesiones' }))

    expect(remove).toHaveBeenCalledWith('/auth/sessions')
    expect(await screen.findByRole('status')).toHaveTextContent('Se han cerrado 2 sesiones.')
    // And the list asks again, so it shows what the server now has.
    await waitFor(() => expect(screen.getByText('1 sesión abierta')).toBeInTheDocument())
  })

  it('closes one by its identifier', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: null })

    paint()

    await userEvent.click(within(await cardOf(/^Extensión de Chrome/)).getByRole('button', { name: 'Cerrar' }))

    expect(remove).toHaveBeenCalledWith('/auth/sessions/2')
    expect(await screen.findByRole('status')).toHaveTextContent('Se ha cerrado la sesión de extensión de chrome.')
  })

  it('when closing fails, says so', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))

    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar las demás sesiones' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido cerrar la sesión')
  })
})
