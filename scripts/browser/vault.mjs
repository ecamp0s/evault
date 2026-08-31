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
  try {
    await waitFor('the vault to open after registering', async () => isUnlocked(page), { timeoutMs: 120_000 })
  } catch (error) {
    /*
     * Say WHY it did not register, because the most likely reason is not a bug.
     * The API allows ten registrations per hour per IP (#25), and a run uses four —
     * so a couple of debugging runs in a row hit the limit, the form shows "algo ha
     * ido mal", and without this message the failure looks like the lock misbehaving
     * fifteen minutes later.
     */
    const onScreen = await page.evaluate('document.body.innerText')
    const rateLimited = /vuelve a intentarlo|demasiad/i.test(onScreen)
    throw new Error(`${error.message}
    ${rateLimited ? 'The API refused the registration — most likely the 10-per-hour limit of #25.' : 'The registration did not go through.'}
    still at ${await page.evaluate('location.pathname')}`)
  }
}

/**
 * Unlocked means the vault itself is on screen — asserted POSITIVELY.
 *
 * WHY THIS IS NOT "not on the unlock screen" ANY MORE — found while investigating
 * #305. It used to check `not /unlock and not /login`, and `/register` passes
 * that. So when a registration failed, register() believed it had succeeded and every
 * case went on to wait fifteen minutes for a warning that could never arrive, on a
 * page with no session at all. A failed setup looked like a feature under test.
 *
 * A negative assertion answers "am I somewhere I recognise as bad", which is a
 * different and much weaker question than "am I where I need to be".
 */
export const isUnlocked = (page) =>
  page.evaluate(`location.pathname === '/' && Boolean(document.querySelector('main, [data-slot="app-layout"]'))`)

export const isLocked = (page) => page.evaluate(`location.pathname.startsWith('/unlock')`)

/**
 * The warning is a sonner toast, matched by the sentence AutoLock.tsx writes. Matching
 * the text and not a test id is deliberate: if someone rewrites that sentence, this
 * verification should notice, because the warning is the whole point of the feature.
 */
export const hasWarning = (page) =>
  page.evaluate(`Array.from(document.querySelectorAll('[data-sonner-toast]')).some(t => /se bloquear/i.test(t.textContent ?? ''))`)

/**
 * Every notice on screen, for the cases that check WHAT one says and not just that it
 * is there. #303 turns the wording into behaviour: the warning has to name the work
 * that locking is about to discard, and only when there is any.
 */
export const toastTexts = (page) =>
  page.evaluate(`Array.from(document.querySelectorAll('[data-sonner-toast]')).map(t => t.textContent ?? '')`)

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

/**
 * Opens the "new entry" dialog and leaves the cursor in a field.
 *
 * WHY THIS EXISTS SEPARATELY FROM poke() — #304. AutoLock listens for keydown on
 * `window`, and dialogs render inside a PORTAL, outside the tree the app lives in. So
 * a keystroke delivered to the window proves nothing about a keystroke typed into a
 * dialog: the second one only counts if the event bubbles all the way up. Today it
 * does, and the day a dialog library swallows keydown for its own focus handling the
 * vault would lock on top of someone who is typing. #303 recorded how expensive that
 * loss is.
 */
export async function openNewEntryDialog(page) {
  /*
   * TWO LABELS, and finding that out cost a diagnostic run. A freshly registered vault
   * is EMPTY, and the empty state offers "Guardar la primera" instead of the toolbar's
   * "Nueva entrada". Since this script registers a new user every time, the empty state
   * is the ONLY one it ever sees — looking for the toolbar button alone waited 30
   * seconds for something that was never going to appear.
   *
   * It is the lesson this project has written down five times over: the path nobody
   * walks is the one that is broken, and a vault with nothing in it is exactly the path
   * a test walks every single run.
   */
  const findButton = `Array.from(document.querySelectorAll('button')).find(b => /nueva entrada|guardar la primera/i.test(b.textContent ?? ''))`

  // Waited for, not assumed: the list arrives through TanStack Query, so right after
  // registering the toolbar is not on screen yet and looking straight away fails.
  await waitFor('the "Nueva entrada" button', async () => page.evaluate(`Boolean(${findButton})`))
  await page.evaluate(`(() => { ${findButton}.click(); return true })()`)
  await waitFor('the new entry dialog', async () => page.evaluate('Boolean(document.querySelector("#notas"))'))
}

export const dialogIsOpen = (page) => page.evaluate('Boolean(document.querySelector("#notas"))')

/**
 * Types into the dialog's notes field, as a person would.
 *
 * Real key events through CDP and not a value assignment: what is under test is the
 * path the event takes from inside the portal up to the window listener, and setting
 * .value directly would skip exactly that.
 */
export async function typeInDialog(page, text) {
  await page.evaluate(`document.querySelector('#notas').focus()`)
  for (const character of text) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: character, key: character })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character })
  }
  await sleep(100)
}

export const dialogText = (page) => page.evaluate(`document.querySelector('#notas')?.value ?? ''`)

/**
 * Puts a TOTP seed into the open dialog, by typing it.
 *
 * Real key events, like `typeInDialog` and for the same reason: this is the last
 * activity the vault will see, so it has to reach the window listener the way a
 * person's typing does. Setting `.value` would skip that and reset nothing.
 */
export async function typeTotpSeed(page, seed) {
  await page.evaluate(`document.querySelector('#totp').focus()`)
  for (const character of seed) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: character, key: character })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character })
  }
  await sleep(200)
}

/** The six digits on screen right now, or an empty string when there are none. */
export const totpOnScreen = (page) =>
  page.evaluate(`document.querySelector('[aria-label="Código del segundo factor"]')?.textContent?.trim() ?? ''`)

export async function poke(page) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 })
  await sleep(100)
}

/**
 * Generates a recovery key and leaves it on screen, untouched. See #329.
 *
 * Through the screen a person would use, like everything else here: the route, the
 * master password, the button. Reaching into `createRecoveryKey` directly would be
 * faster and would stop proving the thing that matters, which is that by the time the
 * key is visible it has ALREADY been registered on the server — which is exactly what
 * makes losing this screen different from losing a draft.
 */
export async function generateRecoveryKey(page, masterPassword) {
  /*
   * Reached through the user menu and NOT with Page.navigate, and finding that out cost
   * a diagnostic run: navigating reloads, and a reload locks the vault (ADR-007). The
   * script ended up on the unlock screen, typed the master password into THAT form, and
   * arrived at the right place having proved something else entirely.
   *
   * Through the menu is also the way a person gets here.
   */
  const openMenu = `document.querySelector('aside button[aria-haspopup="menu"]')`
  await waitFor('the user menu', async () => page.evaluate(`Boolean(${openMenu})`))
  await page.evaluate(`(() => { ${openMenu}.click(); return true })()`)

  const entry = `Array.from(document.querySelectorAll('[role="menuitem"]')).find(i => /clave de recuperaci/i.test(i.textContent ?? ''))`
  await waitFor('the recovery key entry in the menu', async () => page.evaluate(`Boolean(${entry})`))
  await page.evaluate(`(() => { ${entry}.click(); return true })()`)

  await waitFor('the recovery key screen', async () =>
    page.evaluate('location.pathname.includes("recovery-key") && Boolean(document.querySelector("#password"))'))

  await page.evaluate(`(() => {
    const el = document.querySelector('#password')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(masterPassword)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)

  await page.evaluate(`document.querySelector('form').requestSubmit()`)

  // Generous: it derives the master key again, which is 600.000 PBKDF2 iterations.
  await waitFor('the generated key', async () => recoveryKeyIsOnScreen(page), { timeoutMs: 120_000 })
}

/** Whether the generated key is visible right now, by the marker the screen puts on it. */
export const recoveryKeyIsOnScreen = (page) =>
  page.evaluate('Boolean(document.querySelector(\'[data-testid="recovery-key"]\'))')
