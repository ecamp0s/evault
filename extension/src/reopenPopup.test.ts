import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askToReopen, serveReopen, type Focus } from './reopenPopup'

/** Two ends of one channel, delivering asynchronously as BroadcastChannel does, never to the sender. */
function channels() {
  const ends: { listeners: ((event: { data: unknown }) => void)[]; closed: boolean }[] = [
    { listeners: [], closed: false },
    { listeners: [], closed: false },
  ]
  const end = (self: number) => ({
    postMessage: (data: unknown) => {
      const other = ends[1 - self]
      queueMicrotask(() => other.closed || other.listeners.forEach((listener) => listener({ data })))
    },
    addEventListener: (_: 'message', listener: (event: { data: unknown }) => void) => ends[self].listeners.push(listener),
    close: () => {
      ends[self].closed = true
    },
  })
  return { unlockWindow: end(0), background: end(1), ends }
}

function fakeFocus() {
  let listener: ((windowId: number) => void) | null = null
  const focus: Focus & { opened: number[]; listening: () => boolean; focus: (id: number) => void } = {
    opened: [],
    onFocusChanged: (fn) => {
      listener = fn
      return () => {
        listener = null
      }
    },
    openPopup: async (windowId) => {
      focus.opened.push(windowId)
    },
    listening: () => listener !== null,
    focus: (id) => listener?.(id),
  }
  return focus
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('reopening the popup after the unlock window (#769)', () => {
  it('opens it in the window the unlock came from, once that window has the focus back', async () => {
    const { unlockWindow, background } = channels()
    const focus = fakeFocus()
    serveReopen(background, focus)

    const heard = askToReopen(7, unlockWindow)
    await vi.advanceTimersByTimeAsync(0)
    expect(await heard).toBe(true)

    focus.focus(3)
    expect(focus.opened).toEqual([])
    focus.focus(7)
    expect(focus.opened).toEqual([7])
  })

  it('opens it once, however many times that window takes the focus', async () => {
    const { unlockWindow, background } = channels()
    const focus = fakeFocus()
    serveReopen(background, focus)
    void askToReopen(7, unlockWindow)
    await vi.advanceTimersByTimeAsync(0)

    focus.focus(7)
    focus.focus(7)

    expect(focus.opened).toEqual([7])
    expect(focus.listening()).toBe(false)
  })

  it('gives up quietly when the focus never comes back, instead of opening it later out of nowhere', async () => {
    const { unlockWindow, background } = channels()
    const focus = fakeFocus()
    serveReopen(background, focus, 10_000)
    void askToReopen(7, unlockWindow)
    await vi.advanceTimersByTimeAsync(10_000)

    focus.focus(7)

    expect(focus.opened).toEqual([])
    expect(focus.listening()).toBe(false)
  })

  it('lets the unlock window close even if nobody answers', async () => {
    const { unlockWindow, ends } = channels()

    const heard = askToReopen(7, unlockWindow, 2_000)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(await heard).toBe(false)
    expect(ends[0].closed).toBe(true)
  })

  it('ignores anything on the channel that is not a window id', async () => {
    const { unlockWindow, background } = channels()
    const focus = fakeFocus()
    serveReopen(background, focus)

    unlockWindow.postMessage({ reopenIn: 'seven' })
    unlockWindow.postMessage(null)
    await vi.advanceTimersByTimeAsync(0)

    expect(focus.listening()).toBe(false)
  })
})
