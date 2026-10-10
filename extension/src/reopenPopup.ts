/**
 * Opening the toolbar popup again once Firefox's unlock window is done (#769).
 *
 * WHY IT TAKES TWO PAGES: in Firefox the passkey is asked for in a small window of the
 * extension, because its popup closes the moment Windows Hello appears (ADR-025 §2.2). When
 * that window is done, the popup is what the person wanted in the first place. Opening it
 * from the window itself fails —«Cannot show popup for an inactive window», measured in
 * #769— because the focused window is still the unlock one. So the window asks the
 * background page, which outlives it, and closes; the background page waits for the window
 * the unlock came from to take the focus back, and opens the popup there. Measured working
 * with Windows Hello in the Firefox of Windows.
 *
 * By BroadcastChannel, like everything else in the extension (ADR-023 §4). Nothing secret
 * goes through it: a window id.
 */

export const REOPEN_CHANNEL = 'evault-reopen-popup'

/** How long the background page waits for that window to take the focus back. */
export const FOCUS_WAIT_MS = 10_000

/** How long the unlock window waits for the background page to say it heard. */
export const ACKNOWLEDGE_WAIT_MS = 2_000

interface ChannelLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  close(): void
}

/**
 * The unlock window's half: asks, and resolves once the background page has heard, or after
 * a moment if it never does, so the window closes either way and does not take the message
 * with it.
 */
export function askToReopen(windowId: number, channel: ChannelLike, wait = ACKNOWLEDGE_WAIT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), wait)
    const finish = (heard: boolean) => {
      clearTimeout(timer)
      channel.close()
      resolve(heard)
    }
    channel.addEventListener('message', (event) => {
      if ((event.data as { heard?: unknown } | null)?.heard === windowId) finish(true)
    })
    channel.postMessage({ reopenIn: windowId })
  })
}

export interface Focus {
  onFocusChanged(listener: (windowId: number) => void): () => void
  openPopup(windowId: number): Promise<void>
}

/**
 * The background page's half: for each request, waits for that window to take the focus
 * back and opens the popup there, once. If the focus goes nowhere near it in time —the
 * person moved on to something else— it gives up quietly: an unexpected popup later would
 * be worse than none.
 */
export function serveReopen(channel: ChannelLike, focus: Focus, wait = FOCUS_WAIT_MS): void {
  channel.addEventListener('message', (event) => {
    const windowId = (event.data as { reopenIn?: unknown } | null)?.reopenIn
    if (typeof windowId !== 'number') return
    channel.postMessage({ heard: windowId })

    let done = false
    const stop = focus.onFocusChanged((focused) => {
      if (done || focused !== windowId) return
      done = true
      stop()
      clearTimeout(timer)
      focus.openPopup(windowId).catch(() => {
        // Nothing to say and nobody to say it to: the vault is unlocked either way.
      })
    })
    const timer = setTimeout(() => {
      done = true
      stop()
    }, wait)
  })
}
