import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Email } from './Email'
import { useSession, type User } from '@/lib/session'
import * as email from '@/lib/vault/email'
import { DecryptionError } from '@/lib/vault/crypto'
import { hasUnsavedRecoveryKey, useUnsavedWork } from '@/lib/vault/unsavedWork'
import type { GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'

/*
 * The email-change screen. See ADR-014.
 *
 * What is tested here is the screen and not the cryptography: that lives in
 * lib/vault/email.ts and has tests of its own, which is the lesson of #217 — replacing
 * the module with vi.spyOn from here and testing it nowhere was exactly the hole that
 * issue closed.
 */

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
  has_recovery_key: false,
}

const RECOVERY_KEY: GeneratedRecoveryKey = {
  bytes: new Uint8Array(32) as Uint8Array<ArrayBuffer>,
  formatted: 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ23-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WX',
}

function renderScreen(user: User = ADA) {
  useSession.setState({ user, token: 'un-token', rememberedUser: user })

  return render(
    <MemoryRouter>
      <Email />
    </MemoryRouter>,
  )
}

async function fillIn(newEmail = 'ada.lovelace@evault.test', password = 'la contraseña') {
  await userEvent.type(screen.getByLabelText('Correo nuevo'), newEmail)
  await userEvent.type(screen.getByLabelText('Repite el correo nuevo'), newEmail)
  await userEvent.type(screen.getByLabelText('Contraseña maestra'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }))
}

beforeEach(() => {
  useSession.setState({ user: null, token: null, rememberedUser: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('changing the email', () => {
  it('asks for the email twice and does not let one carry on when they differ', async () => {
    /*
     * There is no email verification in the project, so a mistyped email changes the
     * salt of the derivation to something the user does not remember typing. Typing it
     * twice is the only net left (ADR-014 §5.4).
     */
    const change = vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await userEvent.type(screen.getByLabelText('Correo nuevo'), 'ada.lovelace@evault.test')
    await userEvent.type(screen.getByLabelText('Repite el correo nuevo'), 'ada.lovelance@evault.test')
    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'la contraseña')
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }))

    expect(await screen.findByText('Los correos no coinciden')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('demands the master password', async () => {
    const change = vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await userEvent.type(screen.getByLabelText('Correo nuevo'), 'ada.lovelace@evault.test')
    await userEvent.type(screen.getByLabelText('Repite el correo nuevo'), 'ada.lovelace@evault.test')
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }))

    expect(await screen.findByText('Escribe tu contraseña maestra')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('updates the store\'s email only after the server confirms', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await fillIn()

    expect(await screen.findByText('Correo cambiado.')).toBeInTheDocument()
    expect(useSession.getState().user?.email).toBe('ada.lovelace@evault.test')
    // The remembered one too: it is what the lock screen shows when greeting, and if
    // the old one stayed it would ask for the password for an email that no longer
    // exists.
    expect(useSession.getState().rememberedUser?.email).toBe('ada.lovelace@evault.test')
  })

  it('when it fails, it does not touch the store\'s email', async () => {
    /*
     * Saying it too early would leave the user believing their email is one it is not;
     * and since the email is the salt, on the next session thinking they have lost the
     * vault.
     */
    vi.spyOn(email, 'changeEmail').mockRejectedValue(new Error('500'))
    renderScreen()

    await fillIn()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(useSession.getState().user?.email).toBe('ada@evault.test')
  })

  it('tells a wrong password from any other failure', async () => {
    vi.spyOn(email, 'changeEmail').mockRejectedValue(new DecryptionError())
    renderScreen()

    await fillIn()

    expect(await screen.findByText(/no es tu contraseña maestra/i)).toBeInTheDocument()
  })
})

describe('the recovery key', () => {
  /*
   * THE WARNING THAT CANNOT DISAPPEAR, and this test exists for that.
   *
   * It is the exact inverse of the master password screen's — there the recovery key
   * SURVIVES and here it does NOT — because the email is the salt its keys are derived
   * from. They are two sentences saying opposite things and neither can fall out in a
   * refactor of texts.
   */
  it('warns whoever has one that it will stop working', () => {
    renderScreen({ ...ADA, has_recovery_key: true })

    expect(screen.getByText(/dejará de funcionar/i)).toBeInTheDocument()
  })

  it('does not warn whoever has none', () => {
    renderScreen()

    expect(screen.queryByText(/dejará de funcionar/i)).not.toBeInTheDocument()
  })

  it('hands over the new key at the end, to be copied', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(RECOVERY_KEY)
    renderScreen({ ...ADA, has_recovery_key: true })

    await fillIn()

    expect(await screen.findByTestId('recovery-key')).toHaveTextContent(RECOVERY_KEY.formatted)
    expect(screen.getByText(/anterior ha dejado de servir/i)).toBeInTheDocument()
  })

  it('shows no key to whoever had none', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await fillIn()

    expect(await screen.findByText('Correo cambiado.')).toBeInTheDocument()
    expect(screen.queryByTestId('recovery-key')).not.toBeInTheDocument()
  })

  it('tells the module whether there is a key to remake', async () => {
    const change = vi.spyOn(email, 'changeEmail').mockResolvedValue(RECOVERY_KEY)
    renderScreen({ ...ADA, has_recovery_key: true })

    await fillIn()

    expect(change).toHaveBeenCalledWith(
      'ada@evault.test',
      'ada.lovelace@evault.test',
      'la contraseña',
      true,
    )
  })
})

/**
 * The new key must not vanish in silence either. See #329.
 *
 * That issue filed this screen under «passwords half typed, probably not worth
 * anything». It is the worse of the two cases: changing the email regenerates the
 * recovery key (ADR-014), so what is on screen here is the only one that still works,
 * and the previous one has already stopped working.
 */
describe('while the new recovery key is on screen', () => {
  beforeEach(() => {
    useUnsavedWork.setState({ count: 0, kinds: { 'text': 0, 'recovery-key': 0 } })
  })

  it('declares that there is a recovery key to lose', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(RECOVERY_KEY)
    renderScreen({ ...ADA, has_recovery_key: true })

    await fillIn()
    await screen.findByTestId('recovery-key')

    expect(hasUnsavedRecoveryKey()).toBe(true)
  })

  it('declares nothing for whoever had no key to remake', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await fillIn()
    await screen.findByText('Correo cambiado.')

    expect(hasUnsavedRecoveryKey()).toBe(false)
  })
})
