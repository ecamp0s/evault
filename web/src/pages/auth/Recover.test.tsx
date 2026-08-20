import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Recover } from './Recover'
import * as recovery from '@/lib/vault/recovery'
import { DecryptionError } from '@/lib/vault/crypto'
import {
  RECOVERY_ALPHABET,
  generateRecoveryKey,
  parseRecoveryKey,
} from '@/lib/vault/recoveryKey'

const KEY = generateRecoveryKey()

/**
 * Una clave con un carácter cambiado que el carácter de comprobación SÍ detecta.
 *
 * Se busca en vez de alterar a ojo porque la comprobación es un solo carácter: una
 * de cada treinta y dos alteraciones cuadra por casualidad. Alterar sin comprobar
 * hacía este test fallar una de cada treinta y dos ejecuciones, que es la clase de
 * intermitencia más cara de diagnosticar.
 */
function badlyCopiedKey(): string {
  const base = KEY.formatted.replace(/-/g, '')

  for (const character of RECOVERY_ALPHABET) {
    if (character === base[0]) continue

    const altered = character + base.slice(1)

    if ('problem' in parseRecoveryKey(altered)) return altered
  }

  throw new Error('no se ha podido construir una clave mal copiada')
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <Recover />
    </MemoryRouter>,
  )
}

async function fill(key: string) {
  await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
  await userEvent.type(screen.getByLabelText('Clave de recuperación'), key)
  await userEvent.type(screen.getByLabelText('Contraseña maestra nueva'), 'contraseña-larga')
  await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'contraseña-larga')
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar mi cuenta' }))
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

/*
 * Lo que se comprueba aquí es sobre todo que los mensajes distingan lo que hay que
 * distinguir. Quien llega a esta pantalla ya ha tenido un mal día; decirle «no se ha
 * podido» cuando lo que pasa es que le falta un carácter sería gratuito.
 */
describe('la clave mal copiada se detecta antes de salir a la red', () => {
  it('avisa si está incompleta, sin llamar al servidor', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')

    renderScreen()
    await fill('4BE6-HB47')

    expect(await screen.findByText(/no está completa/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('avisa si hay un carácter que no pertenece al alfabeto', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')
    const withBadChar = 'I' + KEY.formatted.replace(/-/g, '').slice(1)

    renderScreen()
    await fill(withBadChar)

    expect(await screen.findByText(/no pertenece a la clave/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  /*
   * El caso que justifica el carácter de comprobación: una clave casi buena. Sin él,
   * esto habría gastado un intento del limitador para acabar en «no válida».
   */
  it('avisa si está mal copiada, aunque tenga la longitud correcta', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')
    renderScreen()
    await fill(badlyCopiedKey())

    expect(await screen.findByText(/mal copiada/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('recuperar', () => {
  it('acepta la clave tal y como se enseñó, con guiones', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess').mockResolvedValue(undefined)

    renderScreen()
    await fill(KEY.formatted)

    expect(spy).toHaveBeenCalledWith(
      'ada@evault.test',
      expect.anything(),
      'contraseña-larga',
    )
  })

  it('exige que las dos contraseñas coincidan', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')

    renderScreen()
    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Clave de recuperación'), KEY.formatted)
    await userEvent.type(screen.getByLabelText('Contraseña maestra nueva'), 'contraseña-larga')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'otra-distinta')
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar mi cuenta' }))

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  /*
   * Que el servidor acepte la clave y el envoltorio no abra es un fallo distinto de
   * «la clave no es la tuya», y el mensaje no puede prometer que reintentar sirva,
   * porque no sirve. Misma lección que la Iteración 3.
   */
  it('distingue el envoltorio que no abre de una clave incorrecta', async () => {
    vi.spyOn(recovery, 'recoverAccess').mockRejectedValue(new DecryptionError())

    renderScreen()
    await fill(KEY.formatted)

    const notice = await screen.findByRole('alert')

    expect(notice).toHaveTextContent(/no hemos podido abrir la vault/i)
    expect(notice).not.toHaveTextContent(/revisa el correo/i)
  })

  it('avisa cuando el servidor rechaza la clave', async () => {
    vi.spyOn(recovery, 'recoverAccess').mockRejectedValue(new Error('401'))

    renderScreen()
    await fill(KEY.formatted)

    expect(await screen.findByRole('alert')).toHaveTextContent(/revisa el correo y la clave/i)
  })
})

describe('what recovering does NOT do to the key it used', () => {
  /*
   * WHY THIS IS TESTED AT ALL — #309. Recovering does not retire the key: the recovery
   * wrapper hangs off the vault key, not off the master key, so a rotation leaves it
   * working. Measured against a real database while closing #289, where the expectation
   * written into that issue turned out to be false.
   *
   * That behaviour is right and is not what these tests guard. They guard that someone
   * is TOLD, because the case that hurts is the one where whoever used the key first
   * was not you — and then it still opens your vault.
   */

  it('says so before recovering, where the action happens', () => {
    renderScreen()

    expect(screen.getByText(/seguirá funcionando/i)).toBeInTheDocument()
  })

  it('points at regenerating, which is the only thing that replaces it', () => {
    renderScreen()

    expect(screen.getByText(/genera una nueva/i)).toBeInTheDocument()
  })

  it('says so again on the way out, where it matters most', async () => {
    vi.spyOn(recovery, 'recoverAccess').mockResolvedValue(undefined)

    function LoginProbe() {
      const location = useLocation()
      const state = location.state as { recovered?: boolean } | null

      return <p>llegó con recovered: {String(state?.recovered)}</p>
    }

    render(
      <MemoryRouter initialEntries={['/recuperar']}>
        <Routes>
          <Route path="/recuperar" element={<Recover />} />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    await fill(KEY.formatted)

    expect(await screen.findByText('llegó con recovered: true')).toBeInTheDocument()
  })
})
