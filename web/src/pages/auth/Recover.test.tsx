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
 * A key with one character changed that the check character DOES catch.
 *
 * It is searched for rather than altered by eye because the check is a single
 * character: one in thirty-two alterations adds up by chance. Altering without checking
 * made this test fail one run in thirty-two, which is the costliest class of
 * intermittency to diagnose.
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
 * What is checked here is above all that the messages tell apart what has to be told
 * apart. Whoever reaches this screen has already had a bad day; telling them «it could
 * not be done» when what is happening is that they are missing a character would be
 * gratuitous.
 */
describe('a mistyped key is caught before going out to the network', () => {
  it('warns when it is incomplete, without calling the server', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')

    renderScreen()
    await fill('4BE6-HB47')

    expect(await screen.findByText(/no está completa/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('warns when a character does not belong to the alphabet', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')
    const withBadChar = 'I' + KEY.formatted.replace(/-/g, '').slice(1)

    renderScreen()
    await fill(withBadChar)

    expect(await screen.findByText(/no pertenece a la clave/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  /*
   * The case that justifies the check character: a key that is almost right. Without it,
   * this would have spent an attempt of the limiter to end in «not valid».
   */
  it('warns when it is mistyped, even at the right length', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess')
    renderScreen()
    await fill(badlyCopiedKey())

    expect(await screen.findByText(/mal copiada/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('recovering', () => {
  it('accepts the key exactly as it was shown, with dashes', async () => {
    const spy = vi.spyOn(recovery, 'recoverAccess').mockResolvedValue(undefined)

    renderScreen()
    await fill(KEY.formatted)

    expect(spy).toHaveBeenCalledWith(
      'ada@evault.test',
      expect.anything(),
      'contraseña-larga',
    )
  })

  it('demands that both passwords match', async () => {
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
   * The server accepting the key and the wrapper not opening is a different failure
   * from «the key is not yours», and the message cannot promise that retrying helps,
   * because it does not. The same lesson as Iteration 3.
   */
  it('tells a wrapper that does not open from a wrong key', async () => {
    vi.spyOn(recovery, 'recoverAccess').mockRejectedValue(new DecryptionError())

    renderScreen()
    await fill(KEY.formatted)

    const notice = await screen.findByRole('alert')

    expect(notice).toHaveTextContent(/no hemos podido abrir la vault/i)
    expect(notice).not.toHaveTextContent(/revisa el correo/i)
  })

  it('warns when the server refuses the key', async () => {
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
