/**
 * The smallest WebDriver client that drives Firefox, for verify-extension-firefox (#759).
 *
 * WHY TWO PROTOCOLS. Firefox no longer speaks CDP, so this is not cdp.mjs with another
 * browser behind it. WebDriver BiDi, over a WebSocket, does everything a page needs —
 * evaluate, navigate, install an extension — and WebDriver classic, over HTTP through
 * geckodriver, is where the WebAuthn virtual authenticator lives. Both measured in #750.
 *
 * WHY NOT A FRAMEWORK, for the reason cdp.mjs gives (#281): Node 24 ships fetch and
 * WebSocket, so both protocols are reachable with no dependency at all.
 *
 * THE PAGE IT HANDS OUT HAS THE SAME TWO METHODS AS CDP'S, `evaluate` and
 * `send('Page.navigate')`, and that is what lets the helpers of vault.mjs —registering,
 * adding entries, adding a passkey through the screen— run in Firefox without a line
 * changed.
 */

import { spawn } from 'node:child_process'
import { sleep } from './cdp.mjs'

/**
 * Starts geckodriver and a headless Firefox under it.
 *
 * `--allow-system-access` IS A PRIVILEGED FLAG, and it is here because BiDi refuses to
 * evaluate in an extension's own page without it (#750). It is acceptable for one reason:
 * the Firefox it applies to is a throwaway one that only this script drives, with a profile
 * geckodriver creates and deletes.
 */
export async function startFirefox({ firefox, geckodriver, port, webSocketPort, prefs = {} }) {
  const driver = spawn(geckodriver, ['--port', String(port), '--websocket-port', String(webSocketPort), '--allow-system-access'], {
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  const exited = new Promise((resolve) => driver.once('exit', resolve))

  for (let attempt = 0; ; attempt++) {
    const up = await fetch(`http://127.0.0.1:${port}/status`).then(() => true, () => false)
    if (up) break
    if (attempt === 50) {
      driver.kill()
      throw new Error(`geckodriver did not answer on ${port}. Is something else on that port?`)
    }
    await sleep(100)
  }

  const classic = async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const { value } = await response.json()
    if (value?.error) throw new Error(`${method} ${path}: ${value.error}: ${value.message}`)
    return value
  }

  let created
  try {
    created = await classic('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          webSocketUrl: true,
          'moz:firefoxOptions': { binary: firefox, args: ['-headless'], prefs },
        },
      },
    })
  } catch (error) {
    driver.kill()
    throw error
  }

  const session = (method, path, body) => classic(method, `/session/${created.sessionId}${path}`, body)

  const socket = await new Promise((resolve, reject) => {
    const opened = new WebSocket(created.capabilities.webSocketUrl)
    opened.onopen = () => resolve(opened)
    opened.onerror = reject
  })

  let nextId = 0
  const bidi = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      const listen = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        socket.removeEventListener('message', listen)
        message.type === 'error' ? reject(new Error(`${method}: ${message.error}: ${message.message}`)) : resolve(message.result)
      }
      socket.addEventListener('message', listen)
      socket.send(JSON.stringify({ id, method, params }))
    })

  /** A page as vault.mjs expects one, bound to a browsing context. */
  const page = (context) => ({
    context,
    async evaluate(expression) {
      const answer = await bidi('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' })
      if (answer.type === 'exception') throw new Error(`evaluate: ${answer.exceptionDetails.text}`)
      return deserialize(answer.result)
    },
    async send(method, params) {
      if (method === 'Page.navigate') return bidi('browsingContext.navigate', { context, url: params.url, wait: 'complete' })
      throw new Error(`no BiDi mapping for ${method}`)
    },
    close: () => bidi('browsingContext.close', { context }).catch(() => {}),
    /**
     * Brings this tab to the front. Firefox's WebAuthn waits, silently, in a tab that is not
     * the active one — and an extension that opens a page on install has just taken the
     * front from whatever the script was using.
     */
    activate: () => bidi('browsingContext.activate', { context }),
  })

  /** Every top-level page open, with its URL. */
  const pages = async () => (await bidi('browsingContext.getTree', {})).contexts

  const { contexts } = await bidi('browsingContext.getTree', {})

  return {
    session,
    bidi,
    page,
    pages,
    first: page(contexts[0].context),
    async stop() {
      await session('DELETE', '').catch(() => {})
      socket.close()
      driver.kill()
      await exited
    },
  }
}

/**
 * A virtual authenticator for the whole session, and taken away afterwards WHATEVER
 * HAPPENS, for the reason webauthn.mjs gives: one left behind makes the next case pass on
 * credentials nobody registered in it.
 *
 * UNLIKE CHROMIUM'S IT IS NOT TIED TO A TAB, and that is why the cases here do not need to
 * navigate one tab from the web to the extension: #750 measured that the passkey the web
 * registered in its tab opens the vault from another. And there is no switch for PRF:
 * Firefox's software token always has it, given the preference startFirefox's caller sets.
 */
export async function withVirtualAuthenticator(firefox, work) {
  const id = await firefox.session('POST', '/webauthn/authenticator', {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserConsenting: true,
    isUserVerified: true,
  })

  try {
    return await work(id)
  } finally {
    await firefox.session('DELETE', `/webauthn/authenticator/${id}`).catch(() => {})
  }
}

function deserialize(value) {
  if (!value) return undefined
  switch (value.type) {
    case 'undefined':
      return undefined
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number':
      return typeof value.value === 'string' ? Number(value.value) : value.value
    case 'array':
      return value.value.map(deserialize)
    case 'object':
      return Object.fromEntries(value.value.map(([key, inner]) => [typeof key === 'string' ? key : deserialize(key), deserialize(inner)]))
    default:
      return `<${value.type}>`
  }
}
