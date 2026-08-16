import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { useSession } from '@/lib/session'
import { AppLayout } from './AppLayout'

/*
 * Lo que estos tests cubren es el comportamiento del cajón: que se abra, que se
 * cierre por los tres caminos y que el foco vuelva donde debe.
 *
 * Lo que NO pueden cubrir es que el cajón aparezca solo en móvil, porque eso lo
 * decide una media query de CSS y jsdom no aplica CSS. Aquí el botón de navegación
 * siempre está en el DOM; en un navegador real, `md:hidden` lo esconde por encima
 * de 768 px. Esa mitad se verifica con emulación de móvil en el navegador, que es
 * lo que pide el criterio de aceptación del issue.
 */

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout title="Vault">
        <p>Contenido</p>
      </AppLayout>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSession.getState().authenticate(
    { id: 1, name: 'Ada Lovelace', email: 'ada@evault.test', created_at: null },
    'token-de-prueba',
  )
})

describe('cajón de navegación', () => {
  it('no está abierto de entrada', () => {
    renderLayout()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el botón de la cabecera lo abre', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir la navegación' }))

    expect(screen.getByRole('dialog', { name: 'Navegación' })).toBeInTheDocument()
  })

  it('Escape lo cierra', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir la navegación' }))
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /*
   * Dejarlo abierto taparía la pantalla a la que se acaba de navegar, que es el
   * fallo clásico de los cajones de navegación en móvil.
   */
  it('navegar lo cierra', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir la navegación' }))

    const links = screen.getAllByRole('link', { name: 'Vault' })

    await userEvent.click(links[links.length - 1])

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('al cerrarse devuelve el foco al botón que lo abrió', async () => {
    renderLayout()

    const trigger = screen.getByRole('button', { name: 'Abrir la navegación' })

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('se puede abrir con el teclado', async () => {
    renderLayout()

    screen.getByRole('button', { name: 'Abrir la navegación' }).focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('dialog', { name: 'Navegación' })).toBeInTheDocument()
  })
})

describe('contenido', () => {
  it('pinta el título y los hijos', () => {
    renderLayout()

    expect(screen.getByRole('heading', { name: 'Vault', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('la navegación del escritorio sigue estando sin abrir nada', () => {
    renderLayout()

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })
})
