import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Recover } from './Recover'
import * as recovery from '@/lib/vault/recovery'
import { DecryptionError } from '@/lib/vault/crypto'
import {
  RECOVERY_ALPHABET,
  generateRecoveryKey,
  parseRecoveryKey,
} from '@/lib/vault/recoveryKey'

const CLAVE = generateRecoveryKey()

/**
 * Una clave con un carácter cambiado que el carácter de comprobación SÍ detecta.
 *
 * Se busca en vez de alterar a ojo porque la comprobación es un solo carácter: una
 * de cada treinta y dos alteraciones cuadra por casualidad. Alterar sin comprobar
 * hacía este test fallar una de cada treinta y dos ejecuciones, que es la clase de
 * intermitencia más cara de diagnosticar.
 */
function claveMalCopiada(): string {
  const base = CLAVE.formatted.replace(/-/g, '')

  for (const caracter of RECOVERY_ALPHABET) {
    if (caracter === base[0]) continue

    const alterada = caracter + base.slice(1)

    if ('problem' in parseRecoveryKey(alterada)) return alterada
  }

  throw new Error('no se ha podido construir una clave mal copiada')
}

function pintar() {
  return render(
    <MemoryRouter>
      <Recover />
    </MemoryRouter>,
  )
}

async function rellenar(clave: string) {
  await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
  await userEvent.type(screen.getByLabelText('Clave de recuperación'), clave)
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
    const espia = vi.spyOn(recovery, 'recoverAccess')

    pintar()
    await rellenar('4BE6-HB47')

    expect(await screen.findByText(/no está completa/i)).toBeInTheDocument()
    expect(espia).not.toHaveBeenCalled()
  })

  it('avisa si hay un carácter que no pertenece al alfabeto', async () => {
    const espia = vi.spyOn(recovery, 'recoverAccess')
    const conLetraMala = 'I' + CLAVE.formatted.replace(/-/g, '').slice(1)

    pintar()
    await rellenar(conLetraMala)

    expect(await screen.findByText(/no pertenece a la clave/i)).toBeInTheDocument()
    expect(espia).not.toHaveBeenCalled()
  })

  /*
   * El caso que justifica el carácter de comprobación: una clave casi buena. Sin él,
   * esto habría gastado un intento del limitador para acabar en «no válida».
   */
  it('avisa si está mal copiada, aunque tenga la longitud correcta', async () => {
    const espia = vi.spyOn(recovery, 'recoverAccess')
    pintar()
    await rellenar(claveMalCopiada())

    expect(await screen.findByText(/mal copiada/i)).toBeInTheDocument()
    expect(espia).not.toHaveBeenCalled()
  })
})

describe('recuperar', () => {
  it('acepta la clave tal y como se enseñó, con guiones', async () => {
    const espia = vi.spyOn(recovery, 'recoverAccess').mockResolvedValue(undefined)

    pintar()
    await rellenar(CLAVE.formatted)

    expect(espia).toHaveBeenCalledWith(
      'ada@evault.test',
      expect.anything(),
      'contraseña-larga',
    )
  })

  it('exige que las dos contraseñas coincidan', async () => {
    const espia = vi.spyOn(recovery, 'recoverAccess')

    pintar()
    await userEvent.type(screen.getByLabelText('Correo'), 'ada@evault.test')
    await userEvent.type(screen.getByLabelText('Clave de recuperación'), CLAVE.formatted)
    await userEvent.type(screen.getByLabelText('Contraseña maestra nueva'), 'contraseña-larga')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'otra-distinta')
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar mi cuenta' }))

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument()
    expect(espia).not.toHaveBeenCalled()
  })

  /*
   * Que el servidor acepte la clave y el envoltorio no abra es un fallo distinto de
   * «la clave no es la tuya», y el mensaje no puede prometer que reintentar sirva,
   * porque no sirve. Misma lección que la Iteración 3.
   */
  it('distingue el envoltorio que no abre de una clave incorrecta', async () => {
    vi.spyOn(recovery, 'recoverAccess').mockRejectedValue(new DecryptionError())

    pintar()
    await rellenar(CLAVE.formatted)

    const aviso = await screen.findByRole('alert')

    expect(aviso).toHaveTextContent(/no hemos podido abrir la vault/i)
    expect(aviso).not.toHaveTextContent(/revisa el correo/i)
  })

  it('avisa cuando el servidor rechaza la clave', async () => {
    vi.spyOn(recovery, 'recoverAccess').mockRejectedValue(new Error('401'))

    pintar()
    await rellenar(CLAVE.formatted)

    expect(await screen.findByRole('alert')).toHaveTextContent(/revisa el correo y la clave/i)
  })
})
