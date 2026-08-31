import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { TotpCode } from './TotpCode'
import { AutoLock } from '@/components/AutoLock'
import { useSession, type User } from '@/lib/session'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { INACTIVITY_LIMIT_MS } from '@/lib/vault/autoLock'
import { useUnsavedWork } from '@/lib/vault/unsavedWork'
import * as clipboard from '@/lib/clipboard'

/** The RFC 6238 seed, whose code at a known instant can be named. */
const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

/**
 * An instant inside the window RFC 6238 lists as T=59, and its six-digit code.
 *
 * The RFC's own table is eight digits; six is what this component shows, so the number
 * was computed for the same instant with an independent implementation —Python's stdlib
 * `hmac`— rather than by running the code under test and writing down what came out.
 */
const AT = 59_000
const CODE = '287082'

const ADA: User = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@evault.test',
  created_at: null,
  has_recovery_key: false,
}

/** Any key at all: nothing is decrypted here, only its presence matters. */
const SOME_KEY = {} as CryptoKey

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(AT)
  useSession.setState({ user: null, token: null, rememberedUser: null })
  useVaultKey.setState({ key: null })
  useUnsavedWork.setState({ count: 0 })
})

afterEach(() => {
  vi.useRealTimers()
  toast.dismiss()
})

describe('TotpCode', () => {
  it('shows the code for the moment it is on screen', async () => {
    render(<TotpCode seed={SEED} />)

    expect(await screen.findByText(CODE)).toBeInTheDocument()
  })

  it('says how many seconds the code has left', async () => {
    render(<TotpCode seed={SEED} />)

    // T=59 is 29 seconds into a 30-second window, so one second remains.
    expect(await screen.findByLabelText('Caduca en 1 segundos')).toBeInTheDocument()
  })

  it('changes the code when the window ends, without being touched', async () => {
    render(<TotpCode seed={SEED} />)
    await screen.findByText(CODE)

    await act(async () => {
      vi.setSystemTime(90_000)
      await vi.advanceTimersByTimeAsync(1000)
    })
    // A second round, because generating the new code is asynchronous: the tick that
    // notices the window changed and the HMAC that answers it are not the same turn.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    expect(screen.queryByText(CODE)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Código del segundo factor').textContent).toMatch(/^\d{6}$/)
  })

  /*
   * THE INSTANT BETWEEN ONE WINDOW AND THE NEXT, which is the only moment this can go
   * wrong and lasts a few milliseconds. Generating is asynchronous, so when the counter
   * rolls over there is a gap before the new digits arrive; showing the previous ones
   * through it would put six digits on screen that look right and no longer work — the
   * exact failure the whole component exists to avoid, and the hardest to notice by
   * hand because it passes too fast to see.
   *
   * The clock is advanced SYNCHRONOUSLY on purpose: that fires the tick and repaints
   * without letting the HMAC resolve, which is the state being asserted.
   */
  it('shows no code at all while the next one is being worked out', async () => {
    render(<TotpCode seed={SEED} />)
    await screen.findByText(CODE)

    act(() => {
      vi.setSystemTime(90_000)
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByLabelText('Código del segundo factor').textContent).not.toBe(CODE)
  })

  /*
   * `copySecret` is what clears the clipboard after 30 seconds, and it is spied on at
   * the clipboard boundary like the rest of the suite does: what matters here is that
   * the code —and not the seed— is what gets copied.
   */
  it('copies the code, and not the seed', async () => {
    const copy = vi
      .spyOn(clipboard, 'copyToClipboard')
      .mockResolvedValue('copied-with-clear')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(<TotpCode seed={SEED} />)
    await screen.findByText(CODE)
    await user.click(screen.getByRole('button', { name: 'Copiar el código' }))

    expect(copy).toHaveBeenCalledWith(CODE)
  })

  it('shows nothing at all for a seed it cannot read', () => {
    render(<TotpCode seed="GEZDGNBV0Y3TQOJQ" />)

    expect(screen.queryByLabelText('Código del segundo factor')).not.toBeInTheDocument()
  })
})

/**
 * THE GUARANTEE ADR-017 §2.4 ASKED FOR, and the reason this file renders `AutoLock`.
 *
 * A counter refreshing every second is NOT the user being there. If it were, having an
 * entry with a second factor open —which is the normal state of somebody using one—
 * would keep the vault unlocked forever, and nothing would look wrong: no error, no
 * warning, just a vault that never locks.
 *
 * These cases are written so that they FAIL when the work is done wrong, which is the
 * only shape that distinguishes a real guarantee from a comment claiming one.
 *
 * WHAT THEY CANNOT SEE, written here rather than assumed: jsdom throttles nothing, so a
 * hidden tab behaves like a visible one. Whether the lock still arrives when Chromium
 * drops the tab to one tick a minute is verified with a real clock in
 * `scripts/verify-auto-lock.mjs`, which is where the case for this lives too.
 */
describe('the counter and the inactivity lock', () => {
  function renderWithLock() {
    useSession.setState({ user: ADA, token: 'un-token', rememberedUser: ADA })
    useVaultKey.setState({ key: SOME_KEY })

    return render(
      <MemoryRouter initialEntries={['/']}>
        <AutoLock />
        <Routes>
          <Route path="/" element={<TotpCode seed={SEED} />} />
          <Route path="/unlock" element={<p>Tu vault está bloqueada</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('locks the vault after fifteen minutes with the code ticking on screen', async () => {
    renderWithLock()
    await screen.findByText(CODE)

    await act(async () => {
      vi.setSystemTime(AT + INACTIVITY_LIMIT_MS + 1000)
      await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS + 1000)
    })

    expect(await screen.findByText('Tu vault está bloqueada')).toBeInTheDocument()
  })

  it('takes the code off the screen when the vault locks, like everything else', async () => {
    renderWithLock()
    await screen.findByText(CODE)

    await act(async () => {
      vi.setSystemTime(AT + INACTIVITY_LIMIT_MS + 1000)
      await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS + 1000)
    })

    expect(screen.queryByLabelText('Código del segundo factor')).not.toBeInTheDocument()
    expect(useVaultKey.getState().key).toBeNull()
  })
})
