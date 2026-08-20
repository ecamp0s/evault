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
 * What this file watches over, beyond the clock counting: that the lock works in a
 * BACKGROUND TAB. Browsers throttle the timers of hidden tabs, so a `setInterval` may
 * not run for minutes; if the lock depended on it running, it would arrive when it no
 * longer protects anything.
 *
 * That is this feature's silent failure mode —in development it does not show, because
 * nobody leaves a tab fifteen minutes in the background while programming— and it has a
 * test of its own: moving the clock WITHOUT running the timers.
 */

const ADA: User = { id: 1, name: 'Ada Lovelace', email: 'ada@evault.test', created_at: null, has_recovery_key: false }

/** Any key at all: nothing is decrypted here, all that matters is that it exists. */
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

describe('locking on inactivity', () => {
  it('after fifteen minutes without activity it leads to the lock screen', async () => {
    openSession()
    renderApp()
    expect(screen.getByText('La vault')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
  })

  it('on locking it forgets the key and the token, and keeps the remembered user', async () => {
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS)

    // It is the same thing reloading does, and that is why it leads to the screen that
    // is already covered.
    expect(useVaultKey.getState().key).toBeNull()
    expect(useSession.getState().token).toBeNull()
    expect(useSession.getState().rememberedUser).toEqual(ADA)
  })

  it('does not lock ahead of time', async () => {
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS - 60 * 1000)

    expect(screen.getByText('La vault')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBe(SOME_KEY)
  })

  it('typing restarts the count', async () => {
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)

    // 28 minutes have gone by in total, but never 15 in a row without touching anything.
    expect(screen.getByText('La vault')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBe(SOME_KEY)
  })

  it('warns a minute before, without locking yet', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(WARNING_AT_MS)

    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning.mock.calls[0]?.[0]).toMatch(/se bloqueará en \d+ segundos/)
    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('does not repeat the warning on every check', async () => {
    const warning = vi.spyOn(toast, 'warning')
    openSession()
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS - 1000)

    expect(warning).toHaveBeenCalledTimes(1)
  })
})

describe('the tab in the background', () => {
  it('locks on coming back to it, even though the timer never ran', async () => {
    /*
     * THE TEST THAT JUSTIFIES THE DESIGN. The clock is moved with setSystemTime, which
     * does NOT run timers: it is what happens in a hidden tab the browser has throttled.
     * Afterwards one comes back to it.
     *
     * With a fifteen-minute setTimeout, nothing would happen here. Comparing timestamps,
     * the sum is already done by the time the browser hands control back.
     */
    openSession()
    renderApp()

    vi.setSystemTime(Date.now() + INACTIVITY_LIMIT_MS + 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
    expect(useVaultKey.getState().key).toBeNull()
  })

  it('coming back to it ahead of time does not lock', async () => {
    openSession()
    renderApp()

    vi.setSystemTime(Date.now() + 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(screen.getByText('La vault')).toBeInTheDocument()
  })
})

describe('when the clock does NOT count', () => {
  it('with no session it locks nothing and warns of nothing', async () => {
    const warning = vi.spyOn(toast, 'warning')
    renderApp()

    await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS * 2)

    expect(warning).not.toHaveBeenCalled()
    expect(screen.getByText('La vault')).toBeInTheDocument()
  })

  it('with a session but with the vault already locked it does nothing', async () => {
    /*
     * The case of somebody on an application screen with the vault closed. There is no
     * key to forget, and navigating to the lock screen from wherever they are would be a
     * jump nobody asked for.
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
