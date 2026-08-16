import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MasterPassword } from './MasterPassword'
import { useSession, type User } from '@/lib/session'
import * as masterPassword from '@/lib/vault/masterPassword'
import { DecryptionError } from '@/lib/vault/crypto'

const ADA: User = { id: 1, name: 'Ada', email: 'ada@evault.test', created_at: null }

function renderScreen() {
  return render(
    <MemoryRouter>
      <MasterPassword />
    </MemoryRouter>,
  )
}

async function fill(current = 'la-de-siempre', next = 'la-nueva-larga', repeated = next) {
  await userEvent.type(screen.getByLabelText('Contraseña actual'), current)
  await userEvent.type(screen.getByLabelText('Contraseña nueva'), next)
  await userEvent.type(screen.getByLabelText('Repite la nueva'), repeated)
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar la contraseña' }))
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: ADA, token: 'un-token', rememberedUser: null })
  vi.restoreAllMocks()
})

/*
 * Va contra la intuición y por eso tiene test: quien cambia su contraseña sospechando
 * un robo suele creer que con eso corta todos los accesos. Con la clave de
 * recuperación no es así, porque envuelve la clave de vault y esa no cambia. Ver
 * ADR-010.
 */
it('avisa de que la clave de recuperación seguirá funcionando', () => {
  renderScreen()

  expect(screen.getByText(/seguirá funcionando/i)).toBeInTheDocument()
})

it('repite el aviso de que no hay forma de recuperar la contraseña', () => {
  renderScreen()

  expect(screen.getByText(/no podemos restablecerla/i)).toBeInTheDocument()
})

describe('cambiar', () => {
  it('manda la actual y la nueva', async () => {
    const change = vi.spyOn(masterPassword, 'changeMasterPassword').mockResolvedValue(undefined)

    renderScreen()
    await fill()

    expect(change).toHaveBeenCalledWith('ada@evault.test', 'la-de-siempre', 'la-nueva-larga')
  })

  it('exige que las dos nuevas coincidan', async () => {
    const change = vi.spyOn(masterPassword, 'changeMasterPassword')

    renderScreen()
    await fill('la-de-siempre', 'la-nueva-larga', 'otra-distinta')

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('exige una longitud mínima para la nueva', async () => {
    const change = vi.spyOn(masterPassword, 'changeMasterPassword')

    renderScreen()
    await fill('la-de-siempre', 'corta', 'corta')

    expect(await screen.findByText(/mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  /*
   * La contraseña actual equivocada se reconoce porque el envoltorio no abre, y eso
   * pasa en el cliente antes de mandar nada. El mensaje lo dice tal cual, en vez del
   * genérico «no se ha podido».
   */
  it('dice que la actual no es la suya cuando el envoltorio no abre', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockRejectedValue(new DecryptionError())

    renderScreen()
    await fill()

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es tu contraseña actual/i)
  })

  /*
   * EL FALLO QUE MÁS CARO SALE DE ESTA PANTALLA.
   *
   * Decir «cambiada» y que la petición haya fallado deja al usuario creyendo que su
   * contraseña es una que no es, y a la siguiente sesión pensando que ha perdido la
   * vault. El mensaje solo aparece tras la confirmación del servidor.
   */
  it('no dice que se ha cambiado si la petición falla', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockRejectedValue(new Error('500'))

    renderScreen()
    await fill()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/contraseña cambiada/i)).not.toBeInTheDocument()
  })

  it('confirma solo cuando el servidor ha dicho que sí', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockResolvedValue(undefined)

    renderScreen()
    await fill()

    expect(await screen.findByText(/contraseña cambiada/i)).toBeInTheDocument()
  })

  /*
   * Que las otras sesiones caigan es media razón de ser de la operación, así que la
   * pantalla lo dice en vez de dejar que se descubra.
   */
  it('cuenta que las otras sesiones se han cerrado', async () => {
    vi.spyOn(masterPassword, 'changeMasterPassword').mockResolvedValue(undefined)

    renderScreen()
    await fill()

    expect(await screen.findByText(/otros dispositivos se han cerrado/i)).toBeInTheDocument()
  })
})
