import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEGUNDOS_HASTA_VACIAR, cancelarVaciado, copiar } from './portapapeles'

/**
 * Deja el entorno como un contexto seguro con la API moderna disponible.
 * Devuelve el espía de writeText.
 */
function conApiModerna(implementacion: () => Promise<void> = () => Promise.resolve()) {
  const writeText = vi.fn(implementacion)

  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })

  return writeText
}

/**
 * Reproduce el entorno local del proyecto: http sobre un dominio que no es
 * localhost, donde navigator.clipboard sencillamente no existe.
 */
function sinContextoSeguro() {
  vi.stubGlobal('isSecureContext', false)
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
    writable: true,
  })

  const execCommand = vi.fn(() => true)

  Object.defineProperty(document, 'execCommand', {
    value: execCommand,
    configurable: true,
    writable: true,
  })

  return execCommand
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cancelarVaciado()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('copiar con la API moderna', () => {
  it('escribe el texto en el portapapeles', async () => {
    const writeText = conApiModerna()

    await expect(copiar('secretísima')).resolves.toBe('copiado-con-vaciado')
    expect(writeText).toHaveBeenCalledWith('secretísima')
  })

  it('programa el vaciado y lo ejecuta al cumplirse el plazo', async () => {
    const writeText = conApiModerna()

    await copiar('secretísima')

    expect(writeText).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000)

    expect(writeText).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('no vacía antes de tiempo', async () => {
    const writeText = conApiModerna()

    await copiar('secretísima')
    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000 - 1000)

    expect(writeText).toHaveBeenCalledTimes(1)
  })

  /*
   * Sin esto, copiar dos veces dejaría dos temporizadores en vuelo y el primero
   * vaciaría el portapapeles mientras la segunda contraseña todavía hacía falta.
   */
  it('copiar otra vez reinicia la cuenta en lugar de acumular temporizadores', async () => {
    const writeText = conApiModerna()

    await copiar('primera')
    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000 - 5000)
    await copiar('segunda')
    await vi.advanceTimersByTimeAsync(6000)

    // Las dos copias, y ningún vaciado todavía.
    expect(writeText).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000)

    expect(writeText).toHaveBeenCalledTimes(3)
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('lo que no es secreto se copia sin programar vaciado', async () => {
    const writeText = conApiModerna()

    await copiar('ada@example.com', false)
    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000 * 2)

    expect(writeText).toHaveBeenCalledTimes(1)
  })
})

describe('copiar sin contexto seguro', () => {
  /*
   * El caso del entorno local del proyecto, comprobado en navegador: sobre
   * http://app.evault.claude, isSecureContext es false y navigator.clipboard es
   * undefined. Si esto no funcionara, copiar no funcionaría en desarrollo.
   */
  it('recurre a execCommand cuando la API moderna no existe', async () => {
    const execCommand = sinContextoSeguro()

    await expect(copiar('secretísima')).resolves.toBe('copiado-sin-vaciado')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('no deja el textarea auxiliar en el DOM', async () => {
    sinContextoSeguro()

    await copiar('secretísima')

    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('devuelve error si execCommand no copia', async () => {
    const execCommand = sinContextoSeguro()

    execCommand.mockReturnValue(false)

    await expect(copiar('secretísima')).resolves.toBe('error')
  })

  /*
   * El hallazgo que salió al verificar en navegador: execCommand exige un gesto
   * del usuario, así que en el temporizador de después ya no funciona. Programar
   * un vaciado que no puede ocurrir sería peor que no programarlo, porque el
   * aviso al usuario prometería una limpieza inexistente.
   */
  it('no programa un vaciado que no podría ejecutarse', async () => {
    const execCommand = sinContextoSeguro()

    await copiar('secretísima')
    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000 * 2)

    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})

describe('cuando el navegador deniega el permiso', () => {
  /*
   * Si el permiso está denegado, lo estará también dentro de treinta segundos, así
   * que la copia sale adelante por el plan B pero el vaciado no se promete.
   */
  it('intenta el plan B antes de rendirse, y entonces no promete vaciado', async () => {
    conApiModerna(() => Promise.reject(new Error('NotAllowedError')))

    const execCommand = vi.fn(() => true)

    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    await expect(copiar('secretísima')).resolves.toBe('copiado-sin-vaciado')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('devuelve error si fallan los dos caminos', async () => {
    conApiModerna(() => Promise.reject(new Error('NotAllowedError')))

    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
      writable: true,
    })

    await expect(copiar('secretísima')).resolves.toBe('error')
  })

  it('un fallo no programa ningún vaciado', async () => {
    conApiModerna(() => Promise.reject(new Error('NotAllowedError')))

    const execCommand = vi.fn(() => false)

    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    await copiar('secretísima')
    await vi.advanceTimersByTimeAsync(SEGUNDOS_HASTA_VACIAR * 1000)

    // Solo el intento de copia, ningún intento de vaciado.
    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})
