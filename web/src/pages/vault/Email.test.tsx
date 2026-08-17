import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Email } from './Email'
import { useSession, type User } from '@/lib/session'
import * as email from '@/lib/vault/email'
import { DecryptionError } from '@/lib/vault/crypto'
import type { GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'

/*
 * La pantalla de cambio de correo. Ver ADR-014.
 *
 * Lo que se prueba aquí es la pantalla, no la criptografía: esa vive en
 * lib/vault/email.ts y tiene sus propios tests, que es la lección de #217 — sustituir
 * el módulo con vi.spyOn desde aquí y no probarlo en ninguna parte fue exactamente el
 * agujero que aquel issue cerró.
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

describe('cambiar el correo', () => {
  it('pide el correo dos veces y no deja seguir si no coinciden', async () => {
    /*
     * No hay verificación por email en el proyecto, así que un correo mal escrito
     * cambia el salt de la derivación a algo que el usuario no recuerda haber
     * escrito. Escribirlo dos veces es la única red que queda (ADR-014 §5.4).
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

  it('exige la contraseña maestra', async () => {
    const change = vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await userEvent.type(screen.getByLabelText('Correo nuevo'), 'ada.lovelace@evault.test')
    await userEvent.type(screen.getByLabelText('Repite el correo nuevo'), 'ada.lovelace@evault.test')
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }))

    expect(await screen.findByText('Escribe tu contraseña maestra')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('actualiza el correo del store solo después de que el servidor confirme', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await fillIn()

    expect(await screen.findByText('Correo cambiado.')).toBeInTheDocument()
    expect(useSession.getState().user?.email).toBe('ada.lovelace@evault.test')
    // El recordado también: es lo que la pantalla de bloqueo enseña al saludar, y si
    // se quedara el viejo pediría la contraseña para un correo que ya no existe.
    expect(useSession.getState().rememberedUser?.email).toBe('ada.lovelace@evault.test')
  })

  it('si falla, no toca el correo del store', async () => {
    /*
     * Decirlo antes de tiempo dejaría al usuario creyendo que su correo es uno que no
     * es; y como el correo es el salt, a la siguiente sesión pensando que ha perdido
     * la vault.
     */
    vi.spyOn(email, 'changeEmail').mockRejectedValue(new Error('500'))
    renderScreen()

    await fillIn()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(useSession.getState().user?.email).toBe('ada@evault.test')
  })

  it('distingue una contraseña incorrecta de un fallo cualquiera', async () => {
    vi.spyOn(email, 'changeEmail').mockRejectedValue(new DecryptionError())
    renderScreen()

    await fillIn()

    expect(await screen.findByText(/no es tu contraseña maestra/i)).toBeInTheDocument()
  })
})

describe('la clave de recuperación', () => {
  /*
   * EL AVISO QUE NO PUEDE DESAPARECER, y este test existe para eso.
   *
   * Es la inversa exacta del de la pantalla de contraseña maestra —allí la clave de
   * recuperación SOBREVIVE y aquí NO— porque el correo es el salt del que se derivan
   * sus claves. Son dos frases que dicen lo contrario y ninguna puede caerse en un
   * refactor de textos.
   */
  it('avisa de que dejará de funcionar, a quien tenga una', () => {
    renderScreen({ ...ADA, has_recovery_key: true })

    expect(screen.getByText(/dejará de funcionar/i)).toBeInTheDocument()
  })

  it('no avisa a quien no tiene ninguna', () => {
    renderScreen()

    expect(screen.queryByText(/dejará de funcionar/i)).not.toBeInTheDocument()
  })

  it('entrega la clave nueva al terminar, para copiarla', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(RECOVERY_KEY)
    renderScreen({ ...ADA, has_recovery_key: true })

    await fillIn()

    expect(await screen.findByTestId('recovery-key')).toHaveTextContent(RECOVERY_KEY.formatted)
    expect(screen.getByText(/anterior ha dejado de servir/i)).toBeInTheDocument()
  })

  it('no enseña ninguna clave a quien no tenía', async () => {
    vi.spyOn(email, 'changeEmail').mockResolvedValue(null)
    renderScreen()

    await fillIn()

    expect(await screen.findByText('Correo cambiado.')).toBeInTheDocument()
    expect(screen.queryByTestId('recovery-key')).not.toBeInTheDocument()
  })

  it('le dice al módulo si hay clave que rehacer', async () => {
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
