import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { useSession } from '@/lib/session'
import { AppLayout } from './AppLayout'

/*
 * What these tests cover is the drawer's behaviour: that it opens, that it closes by the
 * three paths and that focus goes back where it should.
 *
 * What they can NOT cover is that the drawer appears only on mobile, because that is
 * decided by a CSS media query and jsdom applies no CSS. Here the navigation button is
 * always in the DOM; in a real browser, `md:hidden` hides it above 768 px. That half is
 * verified with mobile emulation in the browser, which is what the issue's acceptance
 * criterion asks for.
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
    { id: 1, name: 'Ada Lovelace', email: 'ada@evault.test', created_at: null, has_recovery_key: false },
    'token-de-prueba',
  )
})

describe('the navigation drawer', () => {
  it('is not open to begin with', () => {
    renderLayout()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the header button opens it', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir la navegación' }))

    expect(screen.getByRole('dialog', { name: 'Navegación' })).toBeInTheDocument()
  })

  it('Escape closes it', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir la navegación' }))
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /*
   * Leaving it open would cover the very screen one has just navigated to, which is the
   * classic failure of navigation drawers on mobile.
   */
  it('navigating closes it', async () => {
    renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir la navegación' }))

    const links = screen.getAllByRole('link', { name: 'Vault' })

    await userEvent.click(links[links.length - 1])

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('on closing it gives focus back to the button that opened it', async () => {
    renderLayout()

    const trigger = screen.getByRole('button', { name: 'Abrir la navegación' })

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('can be opened with the keyboard', async () => {
    renderLayout()

    screen.getByRole('button', { name: 'Abrir la navegación' }).focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('dialog', { name: 'Navegación' })).toBeInTheDocument()
  })
})

describe('the content', () => {
  it('paints the title and the children', () => {
    renderLayout()

    expect(screen.getByRole('heading', { name: 'Vault', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })

  it('the desktop navigation is still there without opening anything', () => {
    renderLayout()

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })
})

describe('the desktop sidebar', () => {
  /*
   * WHAT THIS TEST IS AND IS NOT, because on its own it would be worth little.
   *
   * jsdom applies no CSS and does no layout, so the thing #350 is about — the user menu
   * ending up 27.464 px down the page — cannot be measured here. What can be checked is
   * that the sidebar still declares it is as tall as the WINDOW rather than as tall as
   * whatever it happens to contain, which is the one decision that keeps the menu
   * reachable.
   *
   * It is a regression guard against somebody removing those classes while tidying up.
   * The measurement itself is in `scripts/verify-large-vault.mjs`, which fails when the
   * menu falls outside the window — verified by reverting this very fix.
   */
  it('is as tall as the window, not as tall as the page', () => {
    renderLayout()

    const sidebar = screen.getByRole('complementary')

    expect(sidebar.className).toContain('md:h-svh')
    expect(sidebar.className).toContain('md:sticky')
  })

  it('scrolls its own sections instead of growing the page', () => {
    renderLayout()

    // getAllBy: the drawer mounts a second navigation with the same label when open,
    // and this is about the desktop one, which is the first.
    expect(screen.getByRole('navigation', { name: 'Principal' }).className).toContain('overflow-y-auto')
  })
})
