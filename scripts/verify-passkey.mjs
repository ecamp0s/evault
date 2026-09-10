#!/usr/bin/env node
/**
 * Verifies that a passkey opens the vault, in a real browser and against the real API.
 *
 * WHY THIS EXISTS — #567. Everything about `ADR-021` is tested in the suite against a
 * double written by hand: one that returns the bytes we decided it should return. That
 * proves what our code does WITH an answer and nothing about whether a real WebAuthn
 * implementation gives that answer, because jsdom has no `navigator.credentials` and
 * never will. #566 closed half of that gap by driving Chromium's own implementation
 * through CDP; this closes the other half by driving the application through it.
 *
 * IT DOES NOT REPLACE #568, and that is written here rather than left implied. A virtual
 * authenticator is CHROMIUM'S model of an authenticator, not Apple's, and iOS differs in
 * at least one documented way that matters. What runs here is «the mechanism works»;
 * what runs on a phone is «it works on the device this was built for».
 *
 * NOR IS IT RUN BY THE CI, deliberately, like the other two verifiers: it drives a real
 * browser, so on every PR it would be intermittent, and an intermittent check gets
 * ignored wholesale — the lesson of #62.
 *
 * Usage:
 *   node scripts/verify-passkey.mjs             # the whole cycle
 *   node scripts/verify-passkey.mjs --smoke     # only that it can drive the app
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   CHROMIUM         browser binary (default chromium-browser)
 *
 * IT REGISTERS ONE ACCOUNT PER CASE, and the API allows ten registrations per hour per
 * IP (#25). The full run uses five, so two runs back to back hit the limit and the third
 * fails at setup — `register()` says so when it happens.
 *
 * The URL must be localhost or an https origin. Without a secure context there is no
 * `crypto.subtle` AND no WebAuthn, so nothing here can even start.
 */

import { spawn } from 'node:child_process'
import { attach, clock, waitFor } from './browser/cdp.mjs'
import { isLocked, isUnlocked, register, snapshot, testCredentials } from './browser/vault.mjs'
import { storedCredentials, withVirtualAuthenticator } from './browser/webauthn.mjs'

const APP_URL = process.env.EVAULT_APP_URL ?? 'http://localhost:5173'
const CHROMIUM = process.env.CHROMIUM ?? 'chromium-browser'
const SMOKE = process.argv.includes('--smoke')
const PORT = 9413

const started = Date.now()
const since = () => (Date.now() - started) / 1000
const log = (message) => console.log(`[${clock()}] ${message}`)

/*
 * THE LABEL AND THE PASSKEY BUTTON ARE MATCHED BY THE TEXT A PERSON READS, not by test
 * ids, and it costs something on purpose: if somebody rewrites those sentences this
 * verification goes red. That is the wanted behaviour — the button being findable and
 * saying what it says IS the feature. It is the same choice `hasWarning` made for the
 * lock warning, and the same trap the #543 rename sprang on `#notas`: selectors are
 * part of this file's surface.
 */
const PASSKEY_BUTTON = /desbloquear con un passkey/i
const REMOVE_BUTTON = /^quitar$/i

/**
 * Waits for the first button whose visible text matches, and clicks it.
 *
 * IT WAITS, AND THAT IS NOT LENIENCY. This is a single-page application: the route
 * changes the instant a guard redirects, and everything on the page arrives afterwards.
 * A click that looked for its button at that instant found none and blamed the
 * application for it — twice while writing #564, on two different screens.
 *
 * Nothing is lost by waiting: a button that never appears still fails, with the same
 * message and the same snapshot, thirty seconds later. What goes away is a result that
 * depends on how fast a chunk loads, which is the intermittency that gets a verifier
 * ignored wholesale (#62).
 */
async function clickByText(page, pattern) {
  const click = () => page.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find((b) => ${pattern}.test((b.textContent ?? '').trim()))
    if (!button) return false
    button.click()
    return true
  })()`)

  try {
    await waitFor(`a button matching ${pattern}`, click)
  } catch {
    throw new Error(`no button matching ${pattern} on screen. ${await snapshot(page)}`)
  }
}

const buttonExists = (page, pattern) =>
  page.evaluate(`Array.from(document.querySelectorAll('button')).some((b) => ${pattern}.test((b.textContent ?? '').trim()))`)

/**
 * Opens the passkeys screen through the user menu.
 *
 * THROUGH THE MENU AND NOT WITH Page.navigate, and `generateRecoveryKey` already paid
 * the diagnostic run that found out why: navigating reloads, and a reload locks the
 * vault (ADR-007). The script lands on the unlock screen, types into THAT form, and
 * proves something else entirely. This one repeated the mistake and cost a red smoke
 * run to notice, which is what the comment over there existed to prevent.
 *
 * It is also how a person gets here.
 */
async function openPasskeysScreen(page) {
  const openMenu = `document.querySelector('aside button[aria-haspopup="menu"]')`
  await waitFor('the user menu', async () => page.evaluate(`Boolean(${openMenu})`))
  await page.evaluate(`(() => { ${openMenu}.click(); return true })()`)

  const entry = `Array.from(document.querySelectorAll('[role="menuitem"]')).find(i => /passkey/i.test(i.textContent ?? ''))`
  await waitFor('the passkeys entry in the menu', async () => page.evaluate(`Boolean(${entry})`))
  await page.evaluate(`(() => { ${entry}.click(); return true })()`)

  await waitFor('the passkeys screen', async () =>
    page.evaluate('location.pathname.includes("passkeys") && Boolean(document.querySelector("#label"))'))
}

/** Registers a passkey through the screen a person would use. */
async function addPasskeyThroughTheScreen(page, credentials, label) {
  await openPasskeysScreen(page)

  const fill = (selector, value) =>
    page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)

  await fill('#label', label)
  await fill('#password', credentials.password)
  await page.evaluate(`document.querySelector('form').requestSubmit()`)

  await waitFor(`the passkey «${label}» in the list`, async () =>
    page.evaluate(`document.body.innerText.includes(${JSON.stringify(label)})`), { timeoutMs: 60_000 })
}

/**
 * Reloads, which by ADR-007 is the vault locking.
 *
 * IT WAITS FOR THE FORM AND NOT ONLY FOR THE ROUTE, and that distinction cost a red run
 * that looked like a regression. `isLocked` reads `location.pathname`, which changes as
 * soon as the guard redirects — before React has mounted anything. Checking for the
 * passkey button at that instant finds no button and blames the application for it.
 *
 * It passed for a while by luck, and stopped the moment the unlock route's chunk grew.
 * A check whose result depends on how fast a chunk loads is the intermittency that gets
 * a verifier ignored wholesale (#62), so it waits for something that is actually there.
 */
async function lockByReloading(page) {
  await page.send('Page.navigate', { url: `${APP_URL}/` })
  await waitFor('the vault to be locked after reloading', async () => isLocked(page))
  await waitFor('the unlock form to be painted', async () =>
    page.evaluate('Boolean(document.querySelector("#password"))'))
}

/*
 * THE CASE THAT JUSTIFIES THE FILE: register a passkey, lock the vault by reloading,
 * and open it again with nothing but the authenticator.
 *
 * It asks the BROWSER whether the credential exists, not the application's own screen.
 * A source that cannot be wrong in the same direction as the code under test is worth
 * more than one that can.
 */
async function theWholeCycle(page, browser) {
  const notes = []
  const credentials = testCredentials('passkey')

  return withVirtualAuthenticator(page, async (authenticatorId) => {
    await register(page, APP_URL, credentials)
    notes.push(`account registered at ${clock()}`)

    await addPasskeyThroughTheScreen(page, credentials, 'Autenticador virtual')

    const stored = await storedCredentials(page, authenticatorId)
    if (stored.length !== 1) {
      throw new Error(`the authenticator holds ${stored.length} credentials, expected 1`)
    }
    notes.push('the browser confirms one credential was created')

    await lockByReloading(page)
    notes.push('vault locked by reloading, as ADR-007 says')

    if (!(await buttonExists(page, PASSKEY_BUTTON))) {
      throw new Error(`no passkey button on the lock screen. ${await snapshot(page)}`)
    }

    await clickByText(page, PASSKEY_BUTTON)
    await waitFor('the vault to open with the passkey', async () => isUnlocked(page), { timeoutMs: 60_000 })
    notes.push(`vault opened with the passkey at ${clock()}, no master password typed`)

    void browser

    return notes
  })
}
theWholeCycle.title = 'a passkey opens the vault after a reload'

/*
 * A REVOKED PASSKEY MUST STOP OPENING, and it is worth its own case precisely because it
 * costs nothing in the code: the vault key never changed, so revoking is deleting a row.
 * That is exactly the kind of thing that works until it quietly does not.
 */
async function revokedStopsWorking(page) {
  const notes = []
  const credentials = testCredentials('revoke')

  return withVirtualAuthenticator(page, async () => {
    await register(page, APP_URL, credentials)
    await addPasskeyThroughTheScreen(page, credentials, 'Para revocar')

    await clickByText(page, REMOVE_BUTTON)
    await clickByText(page, /quitar el passkey/i)

    await waitFor('the passkey to disappear from the list', async () =>
      page.evaluate(`!document.body.innerText.includes('Para revocar')`))
    notes.push('passkey revoked through the screen')

    await lockByReloading(page)
    await clickByText(page, PASSKEY_BUTTON)

    /*
     * It has to STAY locked. Waiting for a state that should not arrive needs a fixed
     * wait, not a `waitFor`: there is nothing to poll for, and polling for the absence
     * of something is how a check ends up passing because it looked too early.
     */
    await new Promise((resolve) => setTimeout(resolve, 8_000))

    if (await isUnlocked(page)) {
      throw new Error('a revoked passkey still opened the vault')
    }
    notes.push('the revoked passkey does not open the vault')

    return notes
  })
}
revokedStopsWorking.title = 'a revoked passkey no longer opens the vault'

/*
 * The master password has to keep working with a passkey registered. It sounds free and
 * is not: this is the path everything else falls back to, and `ADR-021` calls it the
 * main way in.
 */
async function masterPasswordStillWorks(page) {
  const notes = []
  const credentials = testCredentials('maestra')

  return withVirtualAuthenticator(page, async () => {
    await register(page, APP_URL, credentials)
    await addPasskeyThroughTheScreen(page, credentials, 'Coexistencia')
    await lockByReloading(page)

    const fill = (selector, value) =>
      page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, ${JSON.stringify(value)})
        el.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)

    await fill('#password', credentials.password)
    await page.evaluate(`document.querySelector('form').requestSubmit()`)

    await waitFor('the vault to open with the master password', async () => isUnlocked(page), { timeoutMs: 120_000 })
    notes.push('the master password still opens the vault with a passkey registered')

    return notes
  })
}
masterPasswordStillWorks.title = 'the master password still works with a passkey registered'

/*
 * WHAT IS NOT HERE, AND WHY IT IS NOT: unlocking with a passkey and NO NETWORK — #564.
 *
 * It was written, run, and taken out with the measurement in hand rather than
 * abandoned. With the connection cut from the tab, the vault does open — the wrapper is
 * in this device's cache and the code path works — and then the page falls back to the
 * screen that reports a lost connection, because REACT ROUTER CANNOT DOWNLOAD THE
 * ROUTE'S CHUNK. The cache had the passkey; the browser did not have the JavaScript.
 *
 * That is not a defect in the feature and not something a wait would fix. In production
 * the service worker precaches those chunks (ADR-019, #464) and this works; the dev
 * server does not register one, so a run against it is measuring the absence of a
 * service worker and calling it a broken passkey.
 *
 * Automating it properly means serving a production build with its service worker, which
 * is a different mode for this script and more than #564 should carry. Until then the
 * offline path is covered by `passkeyOffline.test.ts`, which exercises the decisions —
 * including that a 401 does NOT fall back to the cache — and by #568 on a real phone,
 * where the installed PWA does have the service worker.
 *
 * Written down so nobody spends the afternoon rediscovering it.
 */

/*
 * WITHOUT AN AUTHENTICATOR THE BUTTON MUST NOT BE THERE. #563 decided it is not painted
 * rather than painted disabled, and this is the case that says the decision survives in
 * a real browser — where `isPasskeySupported` sees Chromium's actual WebAuthn and not a
 * stub written in the suite.
 */
async function noAuthenticatorNoButton(page) {
  const credentials = testCredentials('sin-auth')

  await register(page, APP_URL, credentials)
  await lockByReloading(page)

  /*
   * Chromium HAS WebAuthn, so the button is painted — what is missing is a credential.
   * This checks the other half: with WebAuthn taken away before the page loads, which is
   * what a desktop Firefox looks like, it is not painted at all.
   *
   * TWO THINGS HERE WERE LEARNED THE HARD WAY, and both produced a green that meant
   * nothing until this case went red and got diagnosed instead of guessed at.
   *
   * `Page.enable` FIRST. Without it `addScriptToEvaluateOnNewDocument` is accepted and
   * silently does nothing — the script never runs, the page keeps its WebAuthn, and the
   * case fails claiming the application painted a button it had every right to paint.
   *
   * And `delete` on the prototype, not `defineProperty` on `navigator`.
   * `Object.defineProperty(navigator, 'credentials', { value: undefined })` leaves
   * `navigator.credentials` exactly as it was: the accessor lives on `Navigator.prototype`
   * and that is where it has to be removed.
   */
  await page.send('Page.enable')
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'delete Navigator.prototype.credentials; delete window.PublicKeyCredential;',
  })
  await page.send('Page.navigate', { url: `${APP_URL}/unlock` })
  await waitFor('the lock screen again', async () => isLocked(page))
  await waitFor('the form to be painted', async () =>
    page.evaluate('Boolean(document.querySelector("#password"))'))

  if (await buttonExists(page, PASSKEY_BUTTON)) {
    throw new Error('the passkey button was painted in a browser without WebAuthn')
  }

  return ['no WebAuthn, no button — not even a disabled one']
}
noAuthenticatorNoButton.title = 'without WebAuthn the button is not painted'

/** Only that this script can drive the application at all. */
async function smokeCase(page) {
  const credentials = testCredentials('smoke')

  return withVirtualAuthenticator(page, async (authenticatorId) => {
    await register(page, APP_URL, credentials)
    await addPasskeyThroughTheScreen(page, credentials, 'Smoke')

    const stored = await storedCredentials(page, authenticatorId)

    return [`registered an account and a passkey; the browser holds ${stored.length} credential(s)`]
  })
}
smokeCase.title = 'it can drive the application'

const run = async (testCase, browser) => {
  const name = testCase.title
  try {
    const page = await browser.newTab()
    try {
      const notes = await testCase(page, browser)
      return { name, ok: true, notes }
    } finally {
      page.close()
    }
  } catch (error) {
    return { name, ok: false, notes: [error.message] }
  }
}

async function launchBrowser(port) {
  const process_ = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' })

  await waitFor(`the browser on ${port} to expose CDP`, async () =>
    fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false))
  log(`browser up on ${port}`)

  return {
    newTab: async () => {
      const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
        .then((r) => r.json())
      return attach(target.webSocketDebuggerUrl)
    },
    kill: () => process_.kill(),
  }
}

async function main() {
  const reachable = await fetch(APP_URL).then((r) => r.ok).catch(() => false)
  if (!reachable) fail(`the app does not answer at ${APP_URL}. Start the dev server and the API.`)
  log(`app answering at ${APP_URL}`)

  const browser = await launchBrowser(PORT)

  try {
    const cases = SMOKE
      ? [smokeCase]
      : [theWholeCycle, revokedStopsWorking, masterPasswordStillWorks, noAuthenticatorNoButton]

    /*
     * SEQUENTIAL AND NOT IN PARALLEL, unlike verify-auto-lock. There the cases spend
     * fifteen real minutes each and running them together is what makes the script
     * usable; here each is quick, and they all register accounts against a limiter that
     * counts per IP (#25). In parallel they would race each other into a 429 and the
     * failure would look like the feature being broken.
     */
    const results = []
    for (const testCase of cases) {
      results.push(await run(testCase, browser))
      log(`${testCase.title}: ${results.at(-1).ok ? 'verde' : 'ROJO'}`)
    }

    report(results)
    process.exitCode = results.some((r) => !r.ok) ? 1 : 0
  } finally {
    browser.kill()
  }
}

function report(results) {
  console.log('\n' + '─'.repeat(78))
  for (const { name, ok, notes } of results) {
    console.log(`${ok ? '✓' : '✗'} ${name}`)
    for (const note of notes) console.log(`    ${note}`)
  }
  const failed = results.filter((r) => !r.ok).length
  console.log('─'.repeat(78))
  console.log(failed ? `${failed} de ${results.length} en rojo.` : `${results.length} de ${results.length} en verde.`)
  console.log(`Duración total: ${since().toFixed(0)} s`)
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

await main()
