import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { AutoLock } from './AutoLock'
import { useSession, type User } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { INACTIVITY_LIMIT_MS, WARNING_AT_MS } from '@/lib/vault/autoLock'
import { useUnsavedWork } from '@/lib/vault/unsavedWork'

/*
 * Lo que este fichero vigila, más allá de que el reloj cuente: que el bloqueo
 * funcione en una PESTAÑA DE FONDO. Los navegadores estrangulan los temporizadores de
 * las pestañas ocultas, así que un `setInterval` puede no ejecutarse durante minutos;
 * si el bloqueo dependiera de que se ejecute, llegaría cuando ya no protege de nada.
 *
 * Ese es el modo de fallo silencioso de esta funcionalidad —en desarrollo no se ve,
 * porque nadie deja una pestaña quince minutos de fondo mientras programa— y tiene su
 * test propio: mover el reloj SIN ejecutar los temporizadores.
 */

const ADA: User = { id: 1, name: 'Ada Lovelace', email: 'ada@evault.test', created_at: null, has_recovery_key: false }

/** Una clave cualquiera: aquí no se descifra nada, solo importa que exista. */
const SOME_KEY = {} as CryptoKey

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AutoLock />
      <Routes>
        <Route path="/" element={<p>La vault</p>} />
        <Route path="/desbloquear" element={<p>Tu vault está bloqueada</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function openSession() {
  useSession.setState({ user: ADA, token: 'un-token', rememberedUser: ADA })
  useVaultKey.setState({ key: SOME_KEY })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  useSession.setState({ user: null, token: null, rememberedUser: null })
  useVaultKey.setState({ key: null })
  useUnsavedWork.setState({ count: 0 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('bloqueo por inactividad', () => {
  it('a los quince minutos sin actividad lleva a la pantalla de bloqueo', async () => {
    openSession()
    renderApp()
    expect(screen.getByText('La vault')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
  })

  it('al bloquear olvida la clave y el token, y conserva el usuario recordado', async () => {
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    // Es lo mismo que hace recargar, y por eso lleva a la pantalla ya probada.
    expect(useVaultKey.getState().key).toBeNull()
    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().rememberedUser).toEqual(ADA)
  })

  it('no bloquea antes de tiempo', async () => {
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS - 60 * 1000)

    expect(screen.getByText('La vault')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBe(SOME_KEY)
  })

  it('escribir reinicia la cuenta', async () => {
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)

    // Han pasado 28 minutos en total, pero nunca 15 seguidos sin tocar nada.
    expect(screen.getByText('La vault')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBe(SOME_KEY)
  })

  it('avisa un minuto antes, sin bloquear todavía', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)

    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning.mock.calls[0]?.[0]).toMatch(/se bloqueará en \d+ segundos/)
    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('no repite el aviso en cada comprobación', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS - 1000)

    expect(warning).toHaveBeenCalledTimes(1)
  })
})

describe('la pestaña en segundo plano', () => {
  it('bloquea al volver a ella, aunque el temporizador no se haya ejecutado', async () => {
    /*
     * EL TEST QUE JUSTIFICA EL DISEÑO. Se mueve el reloj con setSystemTime, que NO
     * ejecuta temporizadores: es lo que ocurre en una pestaña oculta que el navegador
     * ha estrangulado. Después se vuelve a ella.
     *
     * Con un setTimeout de quince minutos, aquí no pasaría nada. Comparando marcas de
     * tiempo, la cuenta ya está hecha cuando el navegador devuelve el control.
     */
    openSession()
    renderApp()

    vi.setSystemTime(Date.now() + INACTIVITY_LIMIT_MS + 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('volver a ella antes de tiempo no bloquea', async () => {
    openSession()
    renderApp()

    vi.setSystemTime(Date.now() + 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })
})

describe('cuándo NO cuenta el reloj', () => {
  it('sin sesión no bloquea nada ni avisa', async () => {
    const warning = vi.spyOn(toast, 'warning')
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS * 2)

    expect(warning).not.toHaveBeenCalled()
    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('con sesión pero con la vault ya bloqueada no hace nada', async () => {
    /*
     * El caso de quien está en una pantalla de la aplicación con la vault cerrada. No
     * hay clave que olvidar, y navegar a la pantalla de bloqueo desde donde esté sería
     * un salto que nadie ha pedido.
     */
    useSession.setState({ user: ADA, token: 'un-token', rememberedUser: ADA })
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS * 2)

    expect(screen.getByText('La vault')).toBeInTheDocument()
    expect(useSession.getState().token).toBe('un-token')
  })
})

describe('what the warning says is at stake', () => {
  /*
   * WHY THIS IS NOT COSMETIC — #303. Locking discards whatever is typed into an open
   * dialog, and that is correct: `ADR-007` says the key must not survive inactivity,
   * and an open modal is not activity. What was missing is that the warning never
   * said so, and sixty seconds are only useful to someone who knows they have
   * something to save.
   */

  function holdUnsavedWork() {
    useUnsavedWork.setState({ count: 1 })
  }

  it('names the loss while a form holds unsaved work', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    holdUnsavedWork()
    renderApp()

    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)

    expect(warning.mock.calls[0]?.[0]).toMatch(/se perderá lo que has escrito/)
  })

  it('does not mention any loss when there is nothing to lose', async () => {
    /*
     * The other half of the criterion, and the one that keeps the warning worth
     * reading: a sentence that appears every time is a sentence nobody reads on the
     * one occasion it is true.
     */
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)

    expect(warning.mock.calls[0]?.[0]).not.toMatch(/se perderá/)
  })

  it('says what happened after locking discards it', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    holdUnsavedWork()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(warning).toHaveBeenCalledWith(
      'Se ha descartado lo que estabas escribiendo, sin guardar.',
      expect.objectContaining({ duration: Infinity }),
    )
  })

  it('leaves that notice up until it is dismissed', async () => {
    /*
     * Not a detail of taste. This fires because nobody was at the keyboard, so a
     * notice that fades on its own is read by no one — by definition of when it
     * happens. The warning before locking already stays for the same reason.
     */
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    holdUnsavedWork()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    const options = warning.mock.calls.at(-1)?.[1]

    expect(options).toMatchObject({ duration: Infinity })
  })

  it('says nothing after locking when nothing was being written', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(warning).not.toHaveBeenCalledWith(expect.stringMatching(/descartado/))
  })
})
