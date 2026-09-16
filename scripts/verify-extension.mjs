#!/usr/bin/env node
/**
 * Verifies the extension in a real Chromium: the passkey the WEB registers opens the
 * vault from the popup, and the key goes where `ADR-023` says it goes.
 *
 * WHY THIS EXISTS — #674. The extension's suite tests its decisions against doubles: a
 * `Keeper` with fake timers, an `unlock` with a fake authenticator, a `Sweeper` with a
 * clipboard that is an array. That proves what the code does with an answer and nothing
 * about the four things this file is for, none of which exist outside a browser — that
 * Chromium gives the extension a PRF for the instance's RP ID, that a document the
 * service worker does not own keeps the key when the worker dies, that the clipboard
 * really empties half a minute after the popup is gone, and that closing the browser
 * leaves nothing behind.
 *
 * WHAT IT COVERS AND WHAT IT DOES NOT, because ADR-023 §4 says the opposite and was
 * wrong. The ADR expected the passkey to have to be registered in the same context where
 * it is used, since copying a credential between tabs loses its PRF secret (#665). That
 * is true of COPYING and not of the path a person walks: registering the passkey in the
 * web and navigating THE SAME TAB to the popup keeps the credential and its PRF, so this
 * file drives the whole cycle, web included (measured in #671).
 *
 * What it still cannot say is that a REAL authenticator behaves like this. A virtual one
 * is Chromium's model, and #675 is where Windows Hello answers for itself.
 *
 * NOR IS IT RUN BY THE CI, deliberately, like the other three verifiers: it drives a real
 * browser, so on every PR it would be intermittent, and an intermittent check gets
 * ignored wholesale — the lesson of #62.
 *
 * Usage:
 *   node scripts/verify-extension.mjs           # the five cases, about four minutes
 *   node scripts/verify-extension.mjs --smoke   # only that it can drive the extension
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   CHROMIUM         browser binary (default chromium-browser)
 *
 * IT BUILDS THE EXTENSION ITSELF, into `extension/dist-verify`, and that is not a
 * convenience: the instance is fixed at build time (ADR-023 §2.5), so a `dist/` built by
 * hand points at `app.evault.localhost` or at kastor and every case here would fail
 * against the wrong instance. Its own directory also leaves the `dist/` that is loaded
 * unpacked in a browser alone.
 *
 * IT REGISTERS ONE ACCOUNT PER CASE: five for the full run, one for --smoke. Before the
 * browser starts, `checkRegistrationQuota` asks the API how many registrations it still
 * accepts this hour (#25) and refuses to begin a run that would run out (#667).
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attach, clock, sleep, waitFor } from './browser/cdp.mjs'
import {
  addPasskeyThroughTheScreen, checkRegistrationQuota, clickByText, createEntries,
  register, testCredentials,
} from './browser/vault.mjs'
import { withVirtualAuthenticator } from './browser/webauthn.mjs'

const APP_URL = process.env.EVAULT_APP_URL ?? 'http://localhost:5173'
const CHROMIUM = process.env.CHROMIUM ?? 'chromium-browser'
const SMOKE = process.argv.includes('--smoke')
const PORT = 9414

const EXTENSION = fileURLToPath(new URL('../extension', import.meta.url))
const DIST = join(EXTENSION, 'dist-verify')

/** The web's delay before the clipboard is cleared, plus room for a slow machine. */
const CLEAR_SECONDS = 30

/**
 * Where the browser profiles go, and NOT /tmp, which is where they would obviously go.
 *
 * MEASURED HERE: the Chromium of this machine is a snap, and a snap gets a PRIVATE /tmp.
 * A directory created there by this script is invisible to the browser, and the failure is
 * silent — an extension loaded from it simply is not there, and the popup answers
 * `net::ERR_BLOCKED_BY_CLIENT` as if the flag had been refused. Under the home directory
 * both see the same files.
 */
const PROFILES = tmpdir()

const started = Date.now()
const since = () => (Date.now() - started) / 1000
const log = (message) => console.log(`[${clock()}] ${message}`)

/**
 * The id Chrome gives an extension loaded from a directory.
 *
 * It is derived from the absolute PATH and nothing else: the first sixteen bytes of its
 * SHA-256, with every nibble mapped onto the letters a to p. Computing it here is what
 * lets a case navigate straight to `popup.html` — asking the browser instead would mean
 * finding the service worker's target, and one of the cases exists precisely because
 * that target is allowed to disappear.
 */
const extensionId = (path) =>
  [...createHash('sha256').update(path).digest('hex').slice(0, 32)]
    .map((nibble) => String.fromCharCode(97 + parseInt(nibble, 16)))
    .join('')

const POPUP = `chrome-extension://${extensionId(DIST)}/popup.html`

/**
 * Builds the extension against the instance this run drives.
 *
 * `vite build` alone, without the `tsc -b` the package script runs first: the types are
 * the CI's job on every PR, and paying for them here would slow a run that is about a
 * browser. A type error still fails the build it matters in.
 */
function buildExtension() {
  const vite = join(EXTENSION, 'node_modules', '.bin', 'vite')
  if (!existsSync(vite)) fail(`no vite in extension/node_modules. Run npm ci in extension/.`)

  const built = spawnSync(vite, ['build', '--outDir', DIST], {
    cwd: EXTENSION,
    env: { ...process.env, EVAULT_EXTENSION_ORIGINS: APP_URL },
    encoding: 'utf-8',
  })

  if (built.status !== 0) fail(`the extension did not build:\n${built.stdout ?? ''}${built.stderr ?? ''}`)
  log(`extension built for ${APP_URL} in dist-verify, id ${extensionId(DIST)}`)
}

/* ── driving the popup ─────────────────────────────────────────────────────────────── */

/**
 * Goes from the web to the popup IN THE SAME TAB, which is the point of doing it this way.
 *
 * The virtual authenticator belongs to this tab's session, and so does the credential the
 * web registered in it. Opening the popup in another tab would find an authenticator with
 * nothing in it, and copying the credential over loses the PRF secret (#665) — which is
 * what made ADR-023 §4 conclude that the whole cycle could not be verified at all.
 */
async function toThePopup(page) {
  // Enabled here and not once per case, so `page.errors` is filled for every popup any of
  // them opens: a case that fails while the console was not being watched wastes a run.
  await page.send('Runtime.enable')
  await page.send('Log.enable')
  await page.send('Page.navigate', { url: POPUP })

  /*
   * IT WAITS FOR THE «Comprobando…» VIEW TO GO, not for the form to exist in the DOM, and
   * the difference cost the first two runs of this file. The markup is all there the
   * instant the page parses, hidden; what arrives later is `popup.ts` asking the offscreen
   * document whether the vault is open. Submitting the form before that has run submits a
   * form with no listener on it: nothing happens, nothing is said, and the case fails
   * thirty seconds later blaming the unlock.
   */
  await waitFor('the popup to have asked the offscreen document what it holds', async () =>
    page.evaluate(`Boolean(document.getElementById('loading')?.hidden)`).catch(() => false))
}

const shows = (page, view) => page.evaluate(`!document.getElementById('${view}').hidden`)
const says = (page) => page.evaluate(`document.getElementById('message').textContent`)
const summary = (page) => page.evaluate(`document.getElementById('summary').textContent`)

/** Types an email into the popup's form and submits it. Plain DOM: there is no React here. */
async function unlockInThePopup(page, email) {
  await page.evaluate(`(() => {
    document.getElementById('email').value = ${JSON.stringify(email)}
    document.getElementById('message').textContent = ''
    document.getElementById('locked').requestSubmit()
    return true
  })()`)
}

/**
 * Unlocks and waits, failing with WHAT THE POPUP SAID rather than with a timeout.
 *
 * An unlock that does not happen says why on screen — the instance refused, there is no
 * connection, the passkey does not open this vault — and a case that reported «timed out
 * waiting for the vault to open» threw that sentence away and left every diagnosis to a
 * second run.
 */
async function openTheVault(page, email) {
  await unlockInThePopup(page, email)

  try {
    await waitFor('the vault to open from the popup', async () => shows(page, 'unlocked'), { timeoutMs: 30_000 })
  } catch (error) {
    const said = await says(page).catch(() => '')
    throw new Error(`${error.message}
    the popup says: ${said || '(nothing)'}
    console: ${page.errors.length ? page.errors.join(' | ') : '(clean)'}`)
  }
}

/**
 * What the offscreen document is holding, asked over the custody channel itself.
 *
 * THE KEY COMES BACK AS A DESCRIPTION AND NOT AS THE KEY, and that is the check rather
 * than a limitation of CDP: `extractable` false is ADR-023 §4's first guideline, observed
 * on the object the document is really holding instead of on the line of code that made
 * it. A `CryptoKey` cannot cross `Runtime.evaluate`'s return value anyway.
 */
async function held(page) {
  return page.evaluate(`(async () => {
    const channel = new BroadcastChannel('evault-custody')
    const id = crypto.randomUUID()
    const answer = new Promise((resolve) => {
      channel.addEventListener('message', ({ data }) => {
        if (data.op === 'state' && data.id === id) resolve(data.held)
      })
      setTimeout(() => resolve(null), 2000)
    })
    channel.postMessage({ op: 'ask', id })
    const state = await answer
    channel.close()
    return state && {
      token: state.token,
      vaultId: state.vaultId,
      email: state.email,
      extractable: state.key.extractable,
      algorithm: state.key.algorithm.name,
    }
  })()`)
}

/** Every target the browser has open right now, by URL. */
const targets = async (port = PORT) =>
  fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())

const offscreenIsOpen = async (port = PORT) =>
  (await targets(port)).some((target) => target.url.endsWith('/offscreen.html'))

/**
 * Whether the token still opens the vault, asked of the API and not of the extension.
 *
 * A source that cannot be wrong in the same direction as the code under test: «locking
 * revokes the token» (ADR-023 §2.3) is a claim about the server, so the server answers it.
 */
async function tokenWorks(token, vaultId) {
  const response = await fetch(`${APP_URL}/api/vaults/${vaultId}/items`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  return response.status
}

/** An account, a passkey registered through the web, and the popup open over that tab. */
async function anAccountWithItsPasskey(page, suffix, label) {
  const credentials = testCredentials(suffix)
  await register(page, APP_URL, credentials)
  await addPasskeyThroughTheScreen(page, credentials, label)
  return credentials
}

/* ── the cases ─────────────────────────────────────────────────────────────────────── */

/*
 * THE CASE THAT JUSTIFIES THE FILE: the passkey the web registered opens the vault from
 * the popup, with no master password anywhere near the extension (ADR-023 §2.1).
 *
 * It also checks what must NOT be there. A popup that is only looked at creates no
 * offscreen document — opening one to be told the vault is locked would be the popup
 * making state by looking at it — and, once unlocked, nothing of the key is in storage:
 * `storage.session` was rejected in ADR-023 §2.2 because it only holds JSON, and a run
 * where it stopped being empty would be the key having been taken out raw.
 */
async function elPasskeyDeLaWebAbreLaExtension(page) {
  const notes = []

  return withVirtualAuthenticator(page, async () => {
    const credentials = await anAccountWithItsPasskey(page, 'ext-abre', 'Para la extensión')
    notes.push(`account and passkey registered through the web at ${clock()}`)

    await toThePopup(page)
    page.errors.length = 0

    if (!(await shows(page, 'locked'))) throw new Error('the popup did not open locked')
    if (await offscreenIsOpen()) throw new Error('the popup opened an offscreen document just to be looked at')
    notes.push('opens locked, with no offscreen document')

    await openTheVault(page, credentials.email)
    notes.push(`unlocked with the web's passkey at ${clock()}, no master password typed`)

    const account = await page.evaluate(`document.getElementById('account').textContent`)
    if (account !== credentials.email) throw new Error(`the popup says it is open as «${account}»`)

    if (!(await offscreenIsOpen())) throw new Error('the key is not in an offscreen document')

    const state = await held(page)
    if (!state) throw new Error('the document answers that it holds nothing right after unlocking')
    if (state.extractable !== false) throw new Error('the vault key is extractable')
    notes.push(`the offscreen document holds a non-extractable ${state.algorithm} key`)

    const status = await tokenWorks(state.token, state.vaultId)
    if (status !== 200) throw new Error(`the token the unlock got answers ${status}, not 200`)
    notes.push('its token opens the vault against the API')

    /*
     * Reopening is a NAVIGATION and not a reload for a reason worth keeping: a popup is
     * destroyed the moment it loses focus, so this is what every opening after the first
     * one really is — a fresh page that has to ask the document for everything.
     */
    await toThePopup(page)
    await waitFor('the popup to come back open', async () => shows(page, 'unlocked'))
    notes.push('reopening the popup finds the vault still open')

    const stored = await page.evaluate(`(async () => ({
      local: Object.entries(await chrome.storage.local.get(null)),
      session: Object.entries(await chrome.storage.session.get(null)),
    }))()`)
    const localKeys = stored.local.map(([key]) => key)
    if (localKeys.join() !== 'evault.email' || stored.local[0][1] !== credentials.email) {
      throw new Error(`storage.local holds ${JSON.stringify(stored.local)}, expected only the email`)
    }
    if (stored.session.length > 0) throw new Error(`storage.session holds ${JSON.stringify(stored.session)}`)
    notes.push('storage holds the email and nothing else: no key material anywhere it survives')

    if (page.errors.length > 0) throw new Error(`the popup logged errors: ${page.errors.join(' | ')}`)

    return notes
  })
}
elPasskeyDeLaWebAbreLaExtension.title = 'the passkey the web registered opens the vault from the popup'

/*
 * A REVOKED PASSKEY MUST STOP OPENING, and it is worth its own case here for the same
 * reason as in verify-passkey: revoking is deleting a row, so nothing in the extension
 * changes, and that is exactly the kind of thing that works until it quietly does not.
 *
 * What the popup SAYS is part of the case. A refusal the instance gave must not be blamed
 * on the connection: they are different problems with different answers, and telling them
 * apart is what `ApiFailure.isNetwork` exists for (ADR-019).
 */
async function unPasskeyRevocadoNoAbre(page) {
  const notes = []

  return withVirtualAuthenticator(page, async () => {
    const credentials = await anAccountWithItsPasskey(page, 'ext-revocado', 'Para revocar')

    await clickByText(page, /^quitar$/i)
    await clickByText(page, /quitar el passkey/i)
    await waitFor('the passkey to disappear from the list', async () =>
      page.evaluate(`!document.body.innerText.includes('Para revocar')`))
    notes.push('passkey revoked through the web')

    await toThePopup(page)
    await unlockInThePopup(page, credentials.email)

    await waitFor('the popup to say something', async () => Boolean(await says(page)), { timeoutMs: 30_000 })
    const message = await says(page)

    if (await shows(page, 'unlocked')) throw new Error('a revoked passkey opened the vault from the popup')
    if (!/no ha aceptado/.test(message)) throw new Error(`the popup said «${message}»`)
    if (/conexión|red\b/i.test(message)) throw new Error(`the popup blamed the connection: «${message}»`)
    if (await offscreenIsOpen()) throw new Error('a refused unlock left an offscreen document open')
    notes.push(`stays locked and says «${message}»`)

    return notes
  })
}
unPasskeyRevocadoNoAbre.title = 'a revoked passkey no longer opens the popup'

/*
 * THE KEY OUTLIVES THE SERVICE WORKER AND NOT THE LOCK, which is the whole reason the
 * offscreen document exists (ADR-023 §2.2). Manifest V3 stops a service worker after
 * thirty seconds of idleness, so a key held there would be gone while the vault still
 * said «open»; the document has no such limit.
 *
 * WHAT «THE DEADLINE» IS AND IS NOT COVERED HERE. Locking after fifteen real minutes of
 * inactivity is `INACTIVITY_LIMIT_MS` firing inside the document, and what it does when it
 * fires is `forget('inactivity')` — the same message another context can post, which is
 * what this case uses. That the countdown is fifteen minutes and that it restarts on use
 * are `keeper.test.ts`'s, with the clock in its hand; faking time here would reproduce
 * what those tests already cover, which is the one thing `scripts/browser/` refuses to do
 * (#281).
 */
async function laClaveSobreviveAlWorkerYNoAlBloqueo(page) {
  const notes = []

  return withVirtualAuthenticator(page, async () => {
    const credentials = await anAccountWithItsPasskey(page, 'ext-custodia', 'Para la custodia')

    await toThePopup(page)
    await openTheVault(page, credentials.email)

    const opened = await held(page)
    if (!opened) throw new Error('nothing is held right after unlocking')

    /*
     * The worker is stopped rather than waited out. Manifest V3 would stop it on its own
     * in about thirty seconds, and a run that sat waiting for it would be a run that goes
     * red the day Chrome changes that number — the intermittency of #62 with extra steps.
     */
    const worker = (await targets()).find((target) => target.url.endsWith('/background.js'))
    if (!worker) throw new Error('the extension has no service worker running to stop')
    await fetch(`http://127.0.0.1:${PORT}/json/close/${worker.id}`)
    await waitFor('the service worker to be gone', async () =>
      !(await targets()).some((target) => target.id === worker.id))
    notes.push('service worker stopped')

    const survived = await held(page)
    if (!survived || survived.token !== opened.token) {
      throw new Error('the key did not survive the service worker: that is what the offscreen document is for')
    }
    if ((await tokenWorks(survived.token, survived.vaultId)) !== 200) {
      throw new Error('the token stopped working when the worker stopped')
    }
    notes.push('the key and its token survive it, held in the offscreen document')

    /*
     * The inactivity signal, posted from this page. It is the message the countdown sends
     * when it fires, so what is measured is everything downstream of it: the key gone, the
     * token revoked, the document closed and an open popup told.
     */
    await page.evaluate(`(() => {
      const channel = new BroadcastChannel('evault-custody')
      channel.postMessage({ op: 'forget', reason: 'inactivity' })
      channel.close()
      return true
    })()`)

    await waitFor('the popup to lock itself', async () => shows(page, 'locked'), { timeoutMs: 10_000 })
    if (!/no usarla/.test(await says(page))) throw new Error(`the popup said «${await says(page)}» after locking`)
    notes.push(`the open popup says it locked for inactivity`)

    await waitFor('the offscreen document to close', async () => !(await offscreenIsOpen()), { timeoutMs: 10_000 })
    notes.push('locking closes the offscreen document')

    await waitFor('the token to be revoked', async () =>
      (await tokenWorks(survived.token, survived.vaultId)) === 401, { timeoutMs: 15_000 })
    notes.push('and revokes its token: the API answers 401')

    await toThePopup(page)
    if (!(await shows(page, 'locked'))) throw new Error('reopening the popup after locking found it open')
    if (await held(page)) throw new Error('something is still held after locking')
    notes.push('reopening it is locked, and nothing is held')

    return notes
  })
}
laClaveSobreviveAlWorkerYNoAlBloqueo.title = 'the key survives the service worker and not the lock'

/*
 * COPYING CLEARS THE CLIPBOARD WITH THE POPUP ALREADY CLOSED, which is the normal case and
 * the one the web's own mechanism cannot serve (#672): a popup is destroyed the instant
 * somebody clicks on the page to paste, and a `setTimeout` in it dies with it.
 *
 * The clipboard is read from a WEB TAB with the permission granted, never from the popup:
 * an extension page reading what it just wrote would be a check that passes on a clipboard
 * nobody else can see.
 */
async function copiarLimpiaElPortapapelesConElPopupCerrado(page, browser) {
  const notes = []
  const password = 'contrasena-copiada-674'

  return withVirtualAuthenticator(page, async () => {
    const credentials = await anAccountWithItsPasskey(page, 'ext-copiar', 'Para copiar')
    await createEntries(page, [
      { name: 'Entrada de prueba', username: 'ada@example.test', password, url: 'https://ejemplo.test/login' },
    ])

    const reader = await browser.newTab()
    await browser.session.send('Browser.grantPermissions', {
      origin: APP_URL,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
    })
    await reader.send('Page.navigate', { url: `${APP_URL}/login` })
    await reader.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    const clipboard = () => reader.evaluate(`navigator.clipboard.readText().catch((e) => 'ERROR ' + e.name)`)

    await reader.evaluate(`navigator.clipboard.writeText('lo que hubiera antes')`)
    if ((await clipboard()) !== 'lo que hubiera antes') throw new Error('the clipboard reader does not work')

    await toThePopup(page)
    await unlockInThePopup(page, credentials.email)
    await waitFor('the entries to arrive', async () => /coincide|Para esta|Ninguna/.test(await summary(page)), { timeoutMs: 30_000 })

    await page.evaluate(`(() => {
      const field = document.getElementById('search')
      field.value = 'Entrada de prueba'
      field.dispatchEvent(new Event('input'))
      return true
    })()`)
    const rows = await page.evaluate(`document.querySelectorAll('#entries li').length`)
    if (rows !== 1) throw new Error(`the search found ${rows} rows, expected 1`)

    await page.evaluate(
      `(Array.from(document.querySelectorAll('#entries li button')).find((b) => b.textContent === 'Contraseña').click(), true)`,
      { userGesture: true },
    )
    await sleep(500)

    if ((await clipboard()) !== password) throw new Error(`the clipboard holds «${await clipboard()}»`)
    if (!new RegExp(`${CLEAR_SECONDS} segundos`).test(await says(page))) {
      throw new Error(`the popup promised «${await says(page)}»`)
    }
    notes.push(`the password is in the clipboard, and the popup promises ${CLEAR_SECONDS} seconds`)

    /*
     * Navigating away destroys this page exactly as closing the popup would, and keeps the
     * tab's virtual authenticator — which is the only thing holding the passkey with its
     * PRF, so it has to be the same tab for the rest of the case.
     */
    await page.send('Page.navigate', { url: 'about:blank' })
    await waitFor('the popup to be gone', async () =>
      !(await targets()).some((target) => target.url === POPUP))
    notes.push('popup closed')

    await sleep((CLEAR_SECONDS - 5) * 1000)
    if ((await clipboard()) !== password) throw new Error(`the clipboard was cleared early, at ${CLEAR_SECONDS - 5} s`)
    notes.push(`still there at ${CLEAR_SECONDS - 5} s: it is not cleared before its time`)

    await waitFor('the clipboard to be cleared', async () => (await clipboard()) === '', { timeoutMs: 20_000 })
    notes.push(`cleared by the offscreen document with the popup closed, around ${CLEAR_SECONDS} s`)

    /*
     * And locking takes a copied password with it WITHOUT WAITING, which is the other half
     * of the rule: locking closes the document, so a pending clearing would die with it
     * and leave the password in the clipboard precisely when the person said «I am done».
     */
    await toThePopup(page)
    await waitFor('the entries again', async () => /coincide|Para esta|Ninguna/.test(await summary(page)), { timeoutMs: 30_000 })
    await page.evaluate(`(() => {
      const field = document.getElementById('search')
      field.value = 'Entrada de prueba'
      field.dispatchEvent(new Event('input'))
      return true
    })()`)
    await page.evaluate(
      `(Array.from(document.querySelectorAll('#entries li button')).find((b) => b.textContent === 'Contraseña').click(), true)`,
      { userGesture: true },
    )
    await sleep(500)
    if ((await clipboard()) !== password) throw new Error('the second copy did not reach the clipboard')

    await page.evaluate(`(document.getElementById('lock').click(), true)`)
    await waitFor('the clipboard to be emptied by the lock', async () => (await clipboard()) === '', { timeoutMs: 10_000 })
    notes.push('locking empties it immediately, without waiting out the delay')

    reader.close()
    return notes
  })
}
copiarLimpiaElPortapapelesConElPopupCerrado.title = 'copying clears the clipboard with the popup closed'

/*
 * CLOSING THE BROWSER LEAVES NOTHING TO OPEN THE VAULT WITH, and it is a case and not an
 * obvious consequence: the key is only gone because nothing ever writes it anywhere that
 * survives, and «nothing writes it» is a property that a single convenient line could end.
 *
 * It runs its own browser, with a profile directory that survives the close — which is
 * what makes the contrast worth having: the remembered email IS in that profile and comes
 * back, so the check is not passing because the profile was empty.
 */
async function cerrarElNavegadorSeLlevaLaClave() {
  const notes = []
  const port = PORT + 1
  const profile = newProfile()

  let browser = await launchBrowser(port, profile)
  let credentials

  try {
    const page = await browser.newTab()
    await withVirtualAuthenticator(page, async () => {
      credentials = await anAccountWithItsPasskey(page, 'ext-cierre', 'Para el cierre')
      await toThePopup(page)
      await openTheVault(page, credentials.email)
    })

    if (!(await offscreenIsOpen(port))) throw new Error('the vault opened without an offscreen document')
    notes.push('unlocked, with the key in the offscreen document')
  } finally {
    browser.kill()
  }

  await sleep(1000)
  browser = await launchBrowser(port, profile)

  try {
    const page = await browser.newTab()
    await toThePopup(page)

    if (!(await shows(page, 'locked'))) throw new Error('the extension came back unlocked after closing the browser')
    if (await offscreenIsOpen(port)) throw new Error('an offscreen document came back with the browser')
    if (await held(page)) throw new Error('something is held after closing the browser')
    notes.push('the same profile comes back locked, holding nothing')

    const remembered = await page.evaluate(`chrome.storage.local.get('evault.email').then((r) => r['evault.email'])`)
    if (remembered !== credentials.email) {
      throw new Error(`the email did not survive the close: ${JSON.stringify(remembered)}`)
    }
    notes.push('and the remembered email does come back, which is what makes the rest of this case mean something')

    return notes
  } finally {
    browser.kill()
    rmSync(profile, { recursive: true, force: true })
  }
}
cerrarElNavegadorSeLlevaLaClave.title = 'closing the browser takes the key and leaves the email'

/** Only that this script can drive the extension at all. */
async function smokeCase(page) {
  return withVirtualAuthenticator(page, async () => {
    const credentials = await anAccountWithItsPasskey(page, 'ext-smoke', 'Smoke')

    await toThePopup(page)
    await openTheVault(page, credentials.email)

    return ['registered an account and a passkey in the web, and opened the vault from the popup']
  })
}
smokeCase.title = 'it can drive the extension'

/* ── the run ───────────────────────────────────────────────────────────────────────── */

const run = async (testCase, browser) => {
  const name = testCase.title
  try {
    const page = await browser.newTab()
    try {
      await ensureLocked(page)
      return { name, ok: true, notes: await testCase(page, browser) }
    } finally {
      await page.close()
    }
  } catch (error) {
    return { name, ok: false, notes: [error.message] }
  }
}

/**
 * Leaves the extension locked before a case starts.
 *
 * THE CUSTODY IS ONE PER EXTENSION AND NOT ONE PER TAB, which is the point of it, so a
 * case that ends unlocked hands the next one a vault that is already open — with somebody
 * else's account in it. The second case went green-then-red on that: its popup showed the
 * previous case's vault and the check read it as a revoked passkey having opened one.
 *
 * Before and not after, because a case that fails half way leaves anything at all.
 */
async function ensureLocked(page) {
  await toThePopup(page)
  if (!(await shows(page, 'unlocked'))) return

  await page.evaluate(`(document.getElementById('lock').click(), true)`)
  await waitFor('the extension to be locked before the case starts', async () => !(await offscreenIsOpen()))
}

/** A profile directory the browser can actually see. See PROFILES. */
function newProfile() {
  mkdirSync(PROFILES, { recursive: true })
  return mkdtempSync(join(PROFILES, 'evault-verify-extension-'))
}

/**
 * A browser with the extension loaded unpacked.
 *
 * `--load-extension` IS WHY THIS USES CHROMIUM AND NOT CHROME. Chrome removed the flag in
 * version 137; Chromium and Chrome for Testing still take it, and this repository's three
 * other verifiers already run on `chromium-browser`. A build that refuses it shows up here
 * as an extension that never appears, so that is what the message says.
 */
async function launchBrowser(port, profile = newProfile()) {
  /*
   * A BROWSER ALREADY ON THIS PORT IS A HARD STOP, and it is here because of the hour it
   * cost. A run that is interrupted can leave its Chromium behind; the next one binds
   * nothing, connects to THAT browser, and drives an extension directory the build has
   * since emptied — every case then fails with `net::ERR_BLOCKED_BY_CLIENT`, which reads
   * exactly like the flag having been dropped. Nothing about the failure points at the
   * leftover process.
   */
  if (await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false)) {
    fail(`something is already listening on ${port}, and it is probably a Chromium left over from an
  interrupted run. It would be driven instead of this one. Find it with
      ps -eo pid,cmd | grep remote-debugging-port=${port}
  and kill it by PID.`)
  }

  const process_ = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--load-extension=${DIST}`, `--disable-extensions-except=${DIST}`,
    'about:blank',
  ], { stdio: 'ignore' })

  await waitFor(`the browser on ${port} to expose CDP`, async () =>
    fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false))

  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json())
  const session = await attach(version.webSocketDebuggerUrl)

  log(`browser up on ${port}`)

  const browser = {
    session,
    profile,
    /**
     * A tab, and a `close` that CLOSES THE TAB and not only the session.
     *
     * Closing the socket alone leaves the tab open, and here that is not untidiness: a tab
     * left on `popup.html` is another popup listening on the custody channel, reacting to
     * the next case's messages and answering its questions. It cost three red cases to
     * find, one of which waited thirty seconds for a popup that was somebody else's.
     */
    newTab: async () => {
      const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
        .then((r) => r.json())
      const session = await attach(target.webSocketDebuggerUrl)
      const closeSession = session.close

      return Object.assign(session, {
        close: async () => {
          closeSession()
          await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {})
        },
      })
    },
    /**
     * Kills the browser and leaves the profile where it is, which one case depends on:
     * `cerrarElNavegadorSeLlevaLaClave` closes the browser and opens it again on the SAME
     * profile, and a kill that deleted it would be testing an empty one.
     */
    kill: () => process_.kill(),
  }

  /*
   * THE EXTENSION IS CHECKED BY OPENING ITS POPUP AND READING IT, and neither half of that
   * is the obvious way.
   *
   * Not by looking for one of its targets in the browser's list: an extension with no
   * service worker running has no target at all, so that check reported «never loaded» for
   * a build that had loaded perfectly well — and blamed the flag for it, which is a wrong
   * answer given confidently.
   *
   * And the page is READ rather than trusted, because a failed navigation to an extension
   * page lands on `chrome-error://chromewebdata` while keeping the requested URL as the
   * document's title. Asking the document what it is, is the only question that separates
   * the two.
   */
  const probe = await browser.newTab()
  try {
    await probe.send('Page.navigate', { url: POPUP })
    await waitFor('the extension to answer at its own URL', async () =>
      probe.evaluate(`location.protocol === 'chrome-extension:' && Boolean(document.querySelector('h1'))`)
        .catch(() => false), { timeoutMs: 20_000 })
  } catch {
    browser.kill()
    throw new Error(`the extension did not load from ${DIST}.
    Does ${CHROMIUM} still accept --load-extension? Chrome dropped the flag in 137, Chromium kept it.`)
  } finally {
    await probe.close()
  }

  log(`extension answering at ${POPUP}`)

  return browser
}

async function main() {
  const reachable = await fetch(APP_URL).then((r) => r.ok).catch(() => false)
  if (!reachable) fail(`the app does not answer at ${APP_URL}. Start the dev server and the API.`)
  log(`app answering at ${APP_URL}`)

  const cases = SMOKE
    ? [smokeCase]
    : [
        elPasskeyDeLaWebAbreLaExtension,
        unPasskeyRevocadoNoAbre,
        laClaveSobreviveAlWorkerYNoAlBloqueo,
        copiarLimpiaElPortapapelesConElPopupCerrado,
        cerrarElNavegadorSeLlevaLaClave,
      ]

  const quota = await checkRegistrationQuota(APP_URL, cases.length)
  if (!quota.ok) fail(quota.message)
  log(quota.message)

  buildExtension()

  const browser = await launchBrowser(PORT)

  try {
    /*
     * SEQUENTIAL, like verify-passkey and for the same two reasons: every case registers
     * an account against a limiter that counts per IP (#25), and they all share one
     * browser — an extension is loaded once, and two cases unlocking at the same time
     * would be two of them fighting over one offscreen document.
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
    rmSync(browser.profile, { recursive: true, force: true })
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
