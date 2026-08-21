import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECONDS_UNTIL_CLEAR, cancelClear, copyToClipboard } from './clipboard'

/**
 * Leaves the environment as a secure context with the modern API available. Returns the
 * writeText spy.
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
 * Reproduces an http deployment over a domain that is not localhost, where
 * navigator.clipboard simply does not exist.
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

describe('copying with the modern API', () => {
  it('writes the text into the clipboard', async () => {
    const writeText = withModernApi()

    await expect(copyToClipboard('secretísima')).resolves.toBe('copied-with-clear')
    expect(writeText).toHaveBeenCalledWith('secretísima')
  })

  it('schedules the clearing and runs it when the deadline comes', async () => {
    const writeText = withModernApi()

    await copyToClipboard('secretísima')

    expect(writeText).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000)

    expect(writeText).toHaveBeenCalledTimes(2)
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('does not clear ahead of time', async () => {
    const writeText = withModernApi()

    await copyToClipboard('secretísima')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 - 1000)

    expect(writeText).toHaveBeenCalledTimes(1)
  })

  /*
   * Without this, copying twice would leave two timers in flight and the first one would
   * clear the clipboard while the second password was still needed.
   */
  it('copying again restarts the count instead of piling up timers', async () => {
    const writeText = withModernApi()

    await copyToClipboard('primera')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 - 5000)
    await copyToClipboard('segunda')
    await vi.advanceTimersByTimeAsync(6000)

    // Both copies, and no clearing yet.
    expect(writeText).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000)

    expect(writeText).toHaveBeenCalledTimes(3)
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('what is not a secret is copied without scheduling a clearing', async () => {
    const writeText = withModernApi()

    await copyToClipboard('ada@example.com', false)
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 * 2)

    expect(writeText).toHaveBeenCalledTimes(1)
  })
})

describe('copying without a secure context', () => {
  /*
   * This case stopped being the project's local environment. It was one while the
   * development domain was http://app.evault.claude, where isSecureContext was false and
   * navigator.clipboard was undefined; since the move to app.evault.localhost there is a
   * secure context and the modern API exists.
   *
   * The fallback is kept, and not out of inertia: it covers any deployment served over
   * http on a domain other than localhost, which is exactly what whoever brings this up
   * on their network without a certificate will find.
   */
  it('falls back to execCommand when the modern API does not exist', async () => {
    const execCommand = withoutSecureContext()

    await expect(copyToClipboard('secretísima')).resolves.toBe('copied-without-clear')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('does not leave the helper textarea in the DOM', async () => {
    withoutSecureContext()

    await copyToClipboard('secretísima')

    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })

  it('returns an error if execCommand does not copy', async () => {
    const execCommand = withoutSecureContext()

    execCommand.mockReturnValue(false)

    await expect(copyToClipboard('secretísima')).resolves.toBe('error')
  })

  /*
   * The finding that came out of verifying in a browser: execCommand demands a user
   * gesture, so in the timer afterwards it no longer works. Scheduling a clearing that
   * cannot happen would be worse than not scheduling it, because the notice to the user
   * would promise a cleanup that does not exist.
   */
  it('does not schedule a clearing that could not be run', async () => {
    const execCommand = withoutSecureContext()

    await copyToClipboard('secretísima')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000 * 2)

    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})

describe('when the browser denies the permission', () => {
  /*
   * If the permission is denied, it will still be denied thirty seconds from now, so the
   * copy goes through by way of plan B but no clearing is promised.
   */
  it('tries plan B before giving up, and then promises no clearing', async () => {
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

  it('returns an error if both paths fail', async () => {
    withModernApi(() => Promise.reject(new Error('NotAllowedError')))

    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
      writable: true,
    })

    await expect(copyToClipboard('secretísima')).resolves.toBe('error')
  })

  it('a failure schedules no clearing at all', async () => {
    withModernApi(() => Promise.reject(new Error('NotAllowedError')))

    const execCommand = vi.fn(() => false)

    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    await copyToClipboard('secretísima')
    await vi.advanceTimersByTimeAsync(SECONDS_UNTIL_CLEAR * 1000)

    // Only the copy attempt, no clearing attempt.
    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})
