import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createQueryClient } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { Passkeys } from './Passkeys'
import type { AccountPasskey } from '@/lib/vault/passkeyAccount'

/*
 * Where somebody adds and removes the passkeys that open their vault. See ADR-021 and
 * issue #561.
 *
 * WHAT THIS FILE PROTECTS IS MOSTLY TEXT, and that is not a lesser kind of test here.
 * This screen opens a THIRD way into the vault, and the Iteration 14 lesson is that a
 * text can fail without any sentence of it being false: the offline screen said
 * everything it had to and a reader took away half. What cannot go missing is the cost —
 * whoever passes this device's Face ID gets in without the master password — and which
 * hostname each passkey belongs to, without which the application cannot explain why
 * somebody's passkey is not in the list.
 */

const EMAIL = 'ada@evault.test'

const A_PASSKEY: AccountPasskey = {
  id: 'passkey-1',
  label: 'iPhone de Ada',
  rp_id: 'evault.local',
  created_at: '2026-09-10T10:00:00+00:00',
  last_used_at: null,
}

function paint() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <Passkeys />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useSession.setState({
    user: { id: 1, name: 'Ada', email: EMAIL, created_at: null, has_recovery_key: false },
    token: 'un-token',
    offline: false,
    rememberedUser: { name: 'Ada', email: EMAIL },
  })

  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [A_PASSKEY] } })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the screen says', () => {
  it('leads with what it buys and not with what it is', async () => {
    paint()

    expect(
      await screen.findByText(/abrir tu vault con tu cara o tu huella/i),
    ).toBeInTheDocument()
  })

  /*
   * The master password stays the main way in, and this screen must not read as if it
   * were being replaced. It is the decision taken when the iteration was planned.
   */
  it('says the master password is still the main way in', async () => {
    paint()

    expect(
      await screen.findByText(/contraseña maestra sigue siendo la/i),
    ).toBeInTheDocument()
  })

  /*
   * THE COST, and this is the test that must never be deleted to make the page read
   * nicer. ADR-021 §5.1 accepts a third door on the condition it is disclosed where the
   * decision is made — the same rule ADR-010 imposed for the recovery key.
   */
  it('says out loud that somebody with this device gets in without the master password', async () => {
    paint()

    expect(
      await screen.findByText(/sin saber tu contraseña maestra/i),
    ).toBeInTheDocument()
  })

  /*
   * ADR-021 §5.2 accepts that the label is metadata in the clear. A screen that let
   * somebody believe otherwise would be worse than one that did not ask for a label.
   */
  it('says the label is the one thing the server can read', async () => {
    paint()

    expect(
      await screen.findByText(/único dato de tu passkey que el servidor puede leer/i),
    ).toBeInTheDocument()
  })

  it('says why the master password is being asked for', async () => {
    paint()

    expect(await screen.findByText(/darle acceso a tu vault al passkey/i)).toBeInTheDocument()
  })
})

describe('the list', () => {
  it('shows what is registered, with its label', async () => {
    paint()

    expect(await screen.findByText('iPhone de Ada')).toBeInTheDocument()
  })

  /*
   * #578: a passkey is scoped to the hostname it was registered under, and this
   * instance answers to two names. Without this line the list is a list of things that
   * sometimes work, with no way to tell which.
   */
  it('says which hostname each passkey belongs to', async () => {
    paint()

    expect(await screen.findByText(/Funciona entrando por evault\.local/i)).toBeInTheDocument()
  })

  /*
   * The date in Spanish, and the assertion names the month rather than the format. It
   * exists because the first version used `toLocaleDateString()` with no locale, which a
   * browser set to English renders as «9/10/2026» — wrong by a month on a Spanish screen
   * without looking wrong. No test caught it; looking at the page did.
   */
  it('writes the date it was last used in Spanish', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: [{ ...A_PASSKEY, last_used_at: '2026-10-09T10:00:00+00:00' }] },
    })

    paint()

    expect(await screen.findByText(/9 de octubre de 2026/i)).toBeInTheDocument()
  })

  it('does not break the line when the date cannot be read', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { data: [{ ...A_PASSKEY, last_used_at: 'no-es-una-fecha' }] },
    })

    paint()

    expect(await screen.findByText(/no se ha podido leer/i)).toBeInTheDocument()
  })

  it('says when one has never been used', async () => {
    paint()

    expect(await screen.findByText(/todavía sin usar/i)).toBeInTheDocument()
  })

  it('says so when there is none', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { data: [] } })

    paint()

    expect(await screen.findByText(/no tienes ningún passkey todavía/i)).toBeInTheDocument()
  })
})

describe('revoking', () => {
  it('does not revoke on the first click', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }))

    expect(api.delete).not.toHaveBeenCalled()
  })

  /*
   * The confirmation has to say what stops working AND what still does. A warning with
   * no «and then this» leaves somebody holding an alarm they cannot act on — the lesson
   * of Iteration 14, applied to the one action on this screen that removes access.
   */
  it('says what stops working and what still does', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /dejará de abrir tu vault ahora mismo/i,
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /seguir entrando con tu contraseña maestra/i,
    )
  })

  it('revokes when it is confirmed', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el passkey' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/auth/passkeys/passkey-1')
    })
  })

  it('leaves it alone when it is not', async () => {
    paint()

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dejarlo como está' }))

    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('adding', () => {
  it('does not send anything without a name', async () => {
    const post = vi.spyOn(api, 'post')

    paint()

    await userEvent.type(await screen.findByLabelText('Contraseña maestra'), 'la-que-sea')
    await userEvent.click(screen.getByRole('button', { name: 'Añadir passkey' }))

    await waitFor(() => {
      expect(screen.getByText(/ponle un nombre/i)).toBeInTheDocument()
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('does not send anything without the master password', async () => {
    const post = vi.spyOn(api, 'post')

    paint()

    await userEvent.type(await screen.findByLabelText('Nombre'), 'Mi portátil')
    await userEvent.click(screen.getByRole('button', { name: 'Añadir passkey' }))

    await waitFor(() => {
      expect(screen.getByText(/escribe tu contraseña maestra/i)).toBeInTheDocument()
    })
    expect(post).not.toHaveBeenCalled()
  })
})
