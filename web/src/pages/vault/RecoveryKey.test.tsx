import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { RecoveryKey } from './RecoveryKey'
import { useSession, type User } from '@/lib/session'
import * as recovery from '@/lib/vault/recovery'
import { DecryptionError } from '@/lib/vault/crypto'
import { generateRecoveryKey } from '@/lib/vault/recoveryKey'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <RecoveryKey />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: ADA, token: 'un-token', rememberedUser: null })
  vi.restoreAllMocks()
})

describe('antes de generarla', () => {
  /*
   * La clave no existe hasta que el usuario ha demostrado que puede abrir su vault.
   * Generarla antes dejaría en pantalla un secreto que quizá no le sirve de nada.
   */
  it('pide la contraseña maestra y no enseña ninguna clave todavía', () => {
    renderScreen()

    expect(screen.getByLabelText('Contraseña maestra')).toBeInTheDocument()
    expect(screen.queryByTestId('recovery-key')).not.toBeInTheDocument()
  })

  it('avisa de que solo se enseña una vez antes de generarla', () => {
    renderScreen()

    expect(screen.getByText(/solo se enseña una vez/i)).toBeInTheDocument()
  })

  /*
   * Distinguir la contraseña equivocada del resto de fallos, que es la lección de
   * la Iteración 3: con la contraseña mal, hay algo que reescribir; con otro fallo,
   * no.
   */
  it('dice que la contraseña no es la suya cuando el envoltorio no abre', async () => {
    vi.spyOn(recovery, 'createRecoveryKey').mockRejectedValue(new DecryptionError())

    renderScreen()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'la-equivocada')
    await userEvent.click(screen.getByRole('button', { name: 'Crear la clave' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es tu contraseña maestra/i)
    expect(screen.queryByTestId('recovery-key')).not.toBeInTheDocument()
  })
})

describe('una vez generada', () => {
  const generated = generateRecoveryKey()

  async function generate() {
    vi.spyOn(recovery, 'createRecoveryKey').mockResolvedValue(generated)

    renderScreen()

    await userEvent.type(screen.getByLabelText('Contraseña maestra'), 'contraseña-larga')
    await userEvent.click(screen.getByRole('button', { name: 'Crear la clave' }))

    await waitFor(() => expect(screen.getByTestId('recovery-key')).toBeInTheDocument())
  }

  it('enseña la clave que se ha generado', async () => {
    await generate()

    expect(screen.getByTestId('recovery-key')).toHaveTextContent(generated.formatted)
  })

  it('dice sin rodeos qué puede hacer quien la tenga', async () => {
    await generate()

    expect(screen.getByText(/puede abrir tu vault sin saber tu contraseña maestra/i))
      .toBeInTheDocument()
  })

  /*
   * LA GARANTÍA CENTRAL DE ESTA PANTALLA.
   *
   * El botón de terminar no existe hasta que se confirma. Sin esto, la confirmación
   * sería un adorno que se salta sin querer, y lo que se está confirmando es el
   * único plan B que va a haber.
   */
  it('no deja terminar hasta confirmar que se ha guardado', async () => {
    await generate()

    expect(screen.getByRole('button', { name: /terminar/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('button', { name: /terminar/i })).toBeEnabled()
  })

  it('ofrece copiar, descargar e imprimir', async () => {
    await generate()

    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /descargar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /imprimir/i })).toBeInTheDocument()
  })

  /*
   * La clave no se persiste en ninguna parte del navegador. Es el mismo test que
   * vigila el token desde ADR-007, aplicado al otro secreto que no puede guardarse.
   */
  it('no deja rastro de la clave en localStorage ni en sessionStorage', async () => {
    await generate()

    const withoutDashes = generated.formatted.replace(/-/g, '')

    expect(JSON.stringify(localStorage)).not.toContain(withoutDashes)
    expect(JSON.stringify(sessionStorage)).not.toContain(withoutDashes)
  })
})
