/**
 * The smallest Chrome DevTools Protocol client that does the job.
 *
 * WHY NOT PUPPETEER OR PLAYWRIGHT — #281. This script runs once every few
 * iterations and its whole point is to spend an hour of real clock. Pulling in a
 * browser automation framework, with the ~300 MB of browsers it downloads, to drive
 * a Chromium that is already installed would be a permanent cost for an occasional
 * run. Node 24 ships a global WebSocket, so the protocol is reachable with no
 * dependencies at all.
 *
 * What this deliberately does NOT wrap is anything that fakes time or visibility.
 * That is the one thing #281 forbids, because faking it reproduces exactly what the
 * 24 unit tests of #220 already cover.
 */

/** Opens a CDP session against one target and returns a tiny command interface. */
export async function attach(webSocketDebuggerUrl) {
  const socket = await new Promise((resolve, reject) => {
    const s = new WebSocket(webSocketDebuggerUrl)
    s.onopen = () => resolve(s)
    s.onerror = reject
  })

  let nextId = 0

  /**
   * Everything the page complained about, for the checks that assert it complained about
   * nothing. Filled only once the caller enables `Runtime` and `Log`; empty otherwise, so
   * a script that does not care pays nothing.
   *
   * ERRORS WHOSE SOURCE IS `network` ARE LEFT OUT, and that is not leniency: a 401 from a
   * refused passkey and a dead connection are what several cases provoke ON PURPOSE, and
   * the browser logs them here. Counting them would make a case fail for succeeding.
   */
  const errors = []

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = message.params
      errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text)
    }
    if (message.method === 'Log.entryAdded') {
      const { entry } = message.params
      if (entry.level === 'error' && entry.source !== 'network') errors.push(entry.text)
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) {
          return
        }
        socket.removeEventListener('message', onMessage)
        message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)
      }
      socket.addEventListener('message', onMessage)
      socket.send(JSON.stringify({ id, method, params }))
    })

  /**
   * Evaluates an expression in the page and returns its value.
   *
   * awaitPromise is on so the caller can await inside the page, which is what makes
   * waiting for a real navigation or a real render readable.
   *
   * `userGesture` makes the browser treat the evaluation as one, which some things
   * genuinely require: `document.execCommand('copy')` is the one this repository needs,
   * and it is what the extension copies with (#672).
   */
  const evaluate = async (expression, { userGesture = false } = {}) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture,
    })
    if (exceptionDetails) {
      throw new Error(`page threw: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`)
    }
    return result?.value
  }

  return { send, evaluate, errors, close: () => socket.close() }
}

/** Waits until `check()` returns truthy, or gives up with a message that says what it was waiting for. */
export async function waitFor(description, check, { timeoutMs = 30_000, everyMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for: ${description}`)
    }
    await sleep(everyMs)
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** HH:MM:SS, because a verification without clock times is an impression. */
export const clock = (at = new Date()) => at.toTimeString().slice(0, 8)
