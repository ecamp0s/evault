import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECONDS_UNTIL_CLEAR } from '@/lib/clipboard'
import { Sweeper, clearClipboard, writeClipboard } from './sweeper'

describe('Sweeper', () => {
  let clear: ReturnType<typeof vi.fn<() => boolean>>
  let sweeper: Sweeper

  beforeEach(() => {
    vi.useFakeTimers()
    clear = vi.fn<() => boolean>().mockReturnValue(true)
    sweeper = new Sweeper({
      clear,
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the clipboard after the web delay, and not before', () => {
    sweeper.copied()

    vi.advanceTimersByTime(SECONDS_UNTIL_CLEAR * 1000 - 1)
    expect(clear).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('restarts the delay when something else is copied, clearing once', () => {
    sweeper.copied()
    vi.advanceTimersByTime(20_000)
    sweeper.copied()
    vi.advanceTimersByTime(SECONDS_UNTIL_CLEAR * 1000 - 1)

    expect(clear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clear).toHaveBeenCalledOnce()
  })

  /*
   * Locking closes the document, and a pending clearing would die with it: the password
   * would stay in the clipboard exactly when the person said they were done.
   */
  it('clears at once when the vault locks with a copy pending', () => {
    sweeper.copied()

    sweeper.flush()

    expect(clear).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(SECONDS_UNTIL_CLEAR * 1000)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('touches nothing when the vault locks with nothing copied', () => {
    sweeper.flush()

    expect(clear).not.toHaveBeenCalled()
  })
})

describe('clearClipboard', () => {
  /*
   * A document stand-in, because Node has none. What it checks is the mechanism #672
   * measured as the one that empties the clipboard: a copy command whose event writes the
   * empty string and stops the browser from writing the selection instead.
   */
  function fakeDocument() {
    const listeners = new Set<(event: ClipboardEvent) => void>()
    const written: string[] = []
    let prevented = false

    const doc = {
      addEventListener: (_: string, listener: (event: ClipboardEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: ClipboardEvent) => void) => listeners.delete(listener),
      execCommand: vi.fn(() => {
        const event = {
          clipboardData: { setData: (_: string, value: string) => written.push(value) },
          preventDefault: () => (prevented = true),
        } as unknown as ClipboardEvent
        for (const listener of listeners) listener(event)
        return true
      }),
    }

    return { doc: doc as unknown as Document, written, prevented: () => prevented, listeners }
  }

  it('writes the empty string through a copy command, not a space and not the Clipboard API', () => {
    const fake = fakeDocument()

    expect(clearClipboard(fake.doc)).toBe(true)
    expect(fake.written).toEqual([''])
    expect(fake.prevented()).toBe(true)
  })

  it('writes the text given through the same command, which is how the popup copies', () => {
    const fake = fakeDocument()

    expect(writeClipboard('s3cr3t', fake.doc)).toBe(true)
    expect(fake.written).toEqual(['s3cr3t'])
  })

  it('leaves no listener behind, so a later copy of the person is not emptied', () => {
    const fake = fakeDocument()

    clearClipboard(fake.doc)

    expect(fake.listeners.size).toBe(0)
  })
})
