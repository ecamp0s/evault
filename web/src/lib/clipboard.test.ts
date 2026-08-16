import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECONDS_UNTIL_CLEAR, cancelClear, copyToClipboard } from './clipboard'

/**
 * Deja el entorno como un contexto seguro con la API moderna disponible.
 * Devuelve el espía de writeText.
 */
function withModernApi(implementation: () => Promise<void> = () => Promise.resolve()) {
  const writeText = vi.fn(implementation)

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
function withoutSecureContext() {
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
  cancelClear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('copiar con la API moderna', () => {
  it('escribe el texto en el portapapeles', async () => {
    const writeText = withModernApi()

    await expect(copyToClipboard('secretísima')).resolves.toBe('copied-with-clear')
    expect(writeText).toHaveBeenCalledWith('secretísima')
  })

  it('programa el vaciado y lo ejecuta al cumplirse el plazo', async () => {
    const writeText = withModernApi()

    await copyToClipboard('secretísima')

    expect(writeText).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000)

    expect(writeText).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('no vacía antes de tiempo', async () => {
    const writeText = withModernApi()

    await copyToClipboard('secretísima')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 - 1000)

    expect(writeText).toHaveBeenCalledTimes(1)
  })

  /*
   * Sin esto, copiar dos veces dejaría dos temporizadores en vuelo y el primero
   * vaciaría el portapapeles mientras la segunda contraseña todavía hacía falta.
   */
  it('copiar otra vez reinicia la cuenta en lugar de acumular temporizadores', async () => {
    const writeText = withModernApi()

    await copyToClipboard('primera')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 - 5000)
    await copyToClipboard('segunda')
    await vi.advanceTimersByTimeAsync(6000)

    // Las dos copias, y ningún vaciado todavía.
    expect(writeText).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000)

    expect(writeText).toHaveBeenCalledTimes(3)
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('lo que no es secreto se copia sin programar vaciado', async () => {
    const writeText = withModernApi()

    await copyToClipboard('ada@example.com', false)
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 * 2)

    expect(writeText).toHaveBeenCalledTimes(1)
  })
})

describe('copiar sin contexto seguro', () => {
  /*
   * Este caso dejó de ser el del entorno local del proyecto. Lo era mientras el
   * dominio de desarrollo fue http://app.evault.claude, donde isSecureContext
   * valía false y navigator.clipboard era undefined; desde el traslado a
   * app.evault.localhost hay contexto seguro y la API moderna existe.
   *
   * El respaldo se conserva, y no por inercia: cubre cualquier despliegue servido
   * por http sobre un dominio que no sea localhost, que es exactamente lo que se
   * encontrará quien levante esto en su red sin certificado.
   */
  it('recurre a execCommand cuando la API moderna no existe', async () => {
    const execCommand = withoutSecureContext()

    await expect(copyToClipboard('secretísima')).resolves.toBe('copied-without-clear')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('no deja el textarea auxiliar en el DOM', async () => {
    withoutSecureContext()

    await copyToClipboard('secretísima')

    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('devuelve error si execCommand no copia', async () => {
    const execCommand = withoutSecureContext()

    execCommand.mockReturnValue(false)

    await expect(copyToClipboard('secretísima')).resolves.toBe('error')
  })

  /*
   * El hallazgo que salió al verificar en navegador: execCommand exige un gesto
   * del usuario, así que en el temporizador de después ya no funciona. Programar
   * un vaciado que no puede ocurrir sería peor que no programarlo, porque el
   * aviso al usuario prometería una limpieza inexistente.
   */
  it('no programa un vaciado que no podría ejecutarse', async () => {
    const execCommand = withoutSecureContext()

    await copyToClipboard('secretísima')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 * 2)

    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})

describe('cuando el navegador deniega el permiso', () => {
  /*
   * Si el permiso está denegado, lo estará también dentro de treinta segundos, así
   * que la copia sale adelante por el plan B pero el vaciado no se promete.
   */
  it('intenta el plan B antes de rendirse, y entonces no promete vaciado', async () => {
    withModernApi(() => Promise.reject(new Error('NotAllowedError')))

    const execCommand = vi.fn(() => true)

    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    await expect(copyToClipboard('secretísima')).resolves.toBe('copied-without-clear')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('devuelve error si fallan los dos caminos', async () => {
    withModernApi(() => Promise.reject(new Error('NotAllowedError')))

    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
      writable: true,
    })

    await expect(copyToClipboard('secretísima')).resolves.toBe('error')
  })

  it('un fallo no programa ningún vaciado', async () => {
    withModernApi(() => Promise.reject(new Error('NotAllowedError')))

    const execCommand = vi.fn(() => false)

    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    await copyToClipboard('secretísima')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000)

    // Solo el intento de copia, ningún intento de vaciado.
    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})
