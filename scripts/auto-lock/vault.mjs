/**
 * Driving the vault through its own interface: registering, and telling apart the
 * three states this verification cares about.
 *
 * Everything here goes through what a person would touch — the form fields by id and
 * the toast by its text. Reaching into the app's modules would be faster and would
 * stop proving the thing that matters, which is that the whole path works in a real
 * browser.
 */

import { sleep, waitFor } from './cdp.mjs'

/** A fresh account per run, so a second run never collides with the first. */
export function testCredentials(suffix) {
  const stamp = Date.now().toString(36)
  return {
    name: `Verificacion ${suffix}`,
    email: `auto-lock-${suffix}-${stamp}@example.test`,
    password: 'contrasena-de-verificacion-281',
  }
}

export async function register(page, appUrl, credentials) {
  await page.send('Page.navigate', { url: `${appUrl}/register` })
  await waitFor('the registration form', async () => page.evaluate('Boolean(document.querySelector("#email"))'))

  // The native setter plus an input event, because React tracks the value on the DOM
  // node and ignores a plain assignment — the field would look filled and submit empty.
  const fill = (selector, value) =>
    page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)

  await fill('#name', credentials.name)
  await fill('#email', credentials.email)
  await fill('#password', credentials.password)
  await fill('#passwordConfirmation', credentials.password)

  await page.evaluate(`document.querySelector('form').requestSubmit()`)

  // Deriving the key is 600.000 PBKDF2 iterations, so this is genuinely slow and the
  // wait has to be generous. It is also the only part of the run that is allowed to be.
  await waitFor('the vault to open after registering', async () => isUnlocked(page), { timeoutMs: 120_000 })
}

/** Unlocked means the vault view is showing and we are not on the unlock screen. */
export const isUnlocked = (page) =>
  page.evaluate(`!location.pathname.startsWith('/desbloquear') && !location.pathname.startsWith('/login')`)

export const isLocked = (page) => page.evaluate(`location.pathname.startsWith('/desbloquear')`)

/**
 * The warning is a sonner toast, matched by the sentence AutoLock.tsx writes. Matching
 * the text and not a test id is deliberate: if someone rewrites that sentence, this
 * verification should notice, because the warning is the whole point of the feature.
 */
export const hasWarning = (page) =>
  page.evaluate(`Array.from(document.querySelectorAll('[data-sonner-toast]')).some(t => /se bloquear/i.test(t.textContent ?? ''))`)

/**
 * Real activity: a key press dispatched as a trusted input event through CDP, not a
 * synthetic DOM event. AutoLock listens on window, so this is the same path a person's
 * keystroke takes.
 */
/**
 * What is on screen right now, for failure messages.
 *
 * WHY — closing #281, the mutation run put case 3 in red through a path nobody had
 * predicted: the warning appeared and then did NOT clear on a keystroke, instead of
 * simply never appearing. The red was the wanted outcome, but the message could not
 * say what had actually happened, and a check that fails for an unexplained reason
 * proves less than it looks. Anything that throws here should print this.
 */
export const snapshot = async (page) => {
  const state = await page.evaluate(`(() => ({
    path: location.pathname,
    toasts: Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.textContent),
  }))()`)
  const toasts = state.toasts.length ? state.toasts.map((text) => `      · ${text}`).join('\n') : '      (ninguno)'
  return `    en pantalla: ruta ${state.path}\n    avisos:\n${toasts}`
}

export async function poke(page) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 })
  await sleep(100)
}
