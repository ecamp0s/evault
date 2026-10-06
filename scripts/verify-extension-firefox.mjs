#!/usr/bin/env node
/**
 * Verifies the Firefox extension in a real Firefox: the passkey the WEB registers opens the
 * vault from its unlock tab, and the key goes where ADR-025 says it goes (#759).
 *
 * WHY THIS EXISTS. ADR-025 §2.7 decided that Firefox gets a verifier like Chrome's, because
 * what is not checked with a command ends up not being checked: every future change to the
 * shared extension code would otherwise have to be repeated by hand in Firefox. It drives
 * the same build that is signed, with three things added afterwards that #750 measured a
 * script needs and the signed build must not carry (see `buildExtension`).
 *
 * WHAT IT COVERS: the web's passkey opens the vault through the unlock tab; a revoked one
 * does not; the key lives in the persistent background page and goes with the lock, token
 * revoked; copying clears the clipboard with the popup closed, and locking clears it at
 * once; and closing the other sessions from the web reaches the extension, listed as
 * «Extensión de Firefox».
 *
 * WHAT IT DOES NOT, each for a reason:
 *
 * - FILLING. The popup fills the active tab of its window, and a script cannot open
 *   Firefox's popup: it can only open `popup.html` in a tab, whose active tab is itself.
 *   Chrome's verifier gets round it with `chrome.action.openPopup()` (#673); Firefox's
 *   `browserAction.openPopup()` answers and nothing appears (#750). Filling is shared code
 *   that verify-extension covers in Chromium, and #754 checks it by hand in Firefox.
 * - LOCKING WITH THE SYSTEM, which does not exist in Firefox (ADR-025 §2.3).
 * - THE INACTIVITY LIMIT, which is fifteen minutes of real clock. #748 measured it in this
 *   very background page, the Keeper's tests hold the rule, and verify-auto-lock exists for
 *   anyone who wants to spend the time.
 * - THAT A REAL AUTHENTICATOR BEHAVES LIKE THIS, which is #754, with Windows Hello.
 *
 * NOR IS IT RUN BY THE CI, like the other four verifiers, for the lesson of #62.
 *
 * Usage:
 *   node scripts/verify-extension-firefox.mjs           # the five cases, about two minutes
 *   node scripts/verify-extension-firefox.mjs --smoke   # only that it can drive the extension
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   FIREFOX          the Firefox binary (default firefox, from Mozilla's APT repository)
 *   GECKODRIVER      the geckodriver binary (default geckodriver)
 *
 * IT REGISTERS ONE ACCOUNT PER CASE: five for the full run, one for --smoke, asked of the
 * API before Firefox starts (#667).
 */

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFirefox, withVirtualAuthenticator } from './browser/bidi.mjs'
import { clock, sleep, waitFor } from './browser/cdp.mjs'
import {
  addPasskeyThroughTheScreen, checkRegistrationQuota, clickByText, createEntries, fillField,
  isUnlocked, register, testCredentials,
} from './browser/vault.mjs'

const APP_URL = process.env.EVAULT_APP_URL ?? 'http://localhost:5173'
const FIREFOX = process.env.FIREFOX ?? 'firefox'
const GECKODRIVER = process.env.GECKODRIVER ?? 'geckodriver'
const SMOKE = process.argv.includes('--smoke')
const DRIVER_PORT = 4460
const BIDI_PORT = 9460

const EXTENSION = fileURLToPath(new URL('../extension', import.meta.url))
const DIST = join(EXTENSION, 'dist-verify-firefox')
const EXTENSION_ID = 'evault@ecamp0s.github.io'

/**
 * The host of this run's `moz-extension://` pages, fixed by preference rather than asked
 * for: Firefox picks one at random per profile, and BiDi cannot list an extension's pages.
 */
const UUID = randomUUID()
const POPUP = `moz-extension://${UUID}/popup.html`

/** The web's delay before the clipboard is cleared. */
const CLEAR_SECONDS = 30

const started = Date.now()
const since = () => (Date.now() - started) / 1000
const log = (message) => console.log(`[${clock()}] ${message}`)

/**
 * Builds the Firefox extension against the instance this run drives, and then adds to THIS
 * copy the three things a script needs and the signed build must not have.
 *
 * - A page that opens itself on install. WebDriver may not navigate to `moz-extension://`
 *   by any route (#750), so the script gets in through a page the extension opens, and from
 *   that page opens every other one with `tabs.create`.
 * - `clipboardRead`, so that page can read what the popup copied and see it emptied. The
 *   extension only writes; reading is the check, not the product.
 *
 * The third, the software authenticator, is a Firefox preference and not the build's.
 */
function buildExtension() {
  const vite = join(EXTENSION, 'node_modules', '.bin', 'vite')
  if (!existsSync(vite)) fail('no vite in extension/node_modules. Run npm ci in extension/.')

  const built = spawnSync(vite, ['build', '--outDir', DIST], {
    cwd: EXTENSION,
    env: { ...process.env, EVAULT_EXTENSION_BROWSER: 'firefox', EVAULT_EXTENSION_ORIGINS: APP_URL },
    encoding: 'utf-8',
  })
  if (built.status !== 0) fail(`the extension did not build:\n${built.stdout ?? ''}${built.stderr ?? ''}`)

  writeFileSync(join(DIST, 'verify-opener.js'), "browser.runtime.onInstalled.addListener(() => browser.tabs.create({ url: 'popup.html' }))\n")
  const background = join(DIST, 'background.html')
  writeFileSync(background, readFileSync(background, 'utf8').replace('<body>', '<body><script src="./verify-opener.js"></script>'))

  const manifestPath = join(DIST, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.permissions.push('clipboardRead')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  log(`Firefox extension built for ${APP_URL} in dist-verify-firefox`)
}

/* ── driving the extension ─────────────────────────────────────────────────────────── */

let firefox
/** The page the extension opened on install: the way in, and where the clipboard is read. */
let home

const extensionPages = async () => (await firefox.pages()).filter((context) => context.url.startsWith(`moz-extension://${UUID}/`))

/** Opens `popup.html` in a new tab from the home page, and waits until it has decided. */
async function openPopup(search = '') {
  const before = new Set((await extensionPages()).map((context) => context.context))
  await home.evaluate(`browser.tabs.create({ url: 'popup.html${search}' }).then(() => true)`)

  let opened
  await waitFor('the new extension page', async () => {
    opened = (await extensionPages()).find((context) => !before.has(context.context))
    return Boolean(opened)
  })

  const page = firefox.page(opened.context)
  await waitFor('the popup to finish asking the custody', async () =>
    page.evaluate(`Boolean(document.getElementById('loading')?.hidden)`).catch(() => false))
  return page
}

const shows = (page, view) => page.evaluate(`!document.getElementById('${view}').hidden`)
const says = (page) => page.evaluate(`document.getElementById('message').textContent`)

/**
 * Presses «Desbloquear» in the popup and follows what Firefox does with it (ADR-025 §2.2):
 * the popup hands over to `popup.html?unlock` and closes, and that tab asks for the
 * passkey, gives the key to the background page, and closes too.
 *
 * Returns the unlock tab if it stayed open, which is what a refused unlock looks like: it
 * stays, saying why, with its button there.
 */
async function unlockFrom(popup, email) {
  await popup.evaluate(`(() => {
    document.getElementById('email').value = ${JSON.stringify(email)}
    document.getElementById('locked').requestSubmit()
    return true
  })()`)

  let unlockTab = null
  let sawIt = false
  await waitFor('the unlock tab to appear and settle', async () => {
    const tab = (await extensionPages()).find((context) => context.url.includes('?unlock'))
    if (tab) {
      sawIt = true
      const page = firefox.page(tab.context)
      const settled = await page.evaluate(`Boolean(document.getElementById('message').textContent)`).catch(() => false)
      if (settled) unlockTab = page
      return settled
    }
    return sawIt
  }, { timeoutMs: 30_000, everyMs: 100 })

  return unlockTab
}

/**
 * What the background page is holding, asked over the custody channel itself, as the
 * Chrome verifier asks its offscreen document: `extractable` observed on the object held.
 */
async function held(page = home) {
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

/** Whether the token still opens the vault, asked of the API and not of the extension. */
async function tokenWorks(token, vaultId) {
  const response = await fetch(`${APP_URL}/api/vaults/${vaultId}/items`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  return response.status
}

/**
 * What the clipboard holds, read from the home page brought to the front first (#705).
 *
 * By the extension and not by BiDi, whose `activate` refuses an extension's page as
 * privileged: the page asks `tabs` to make its own tab the active one.
 */
const clipboard = async () =>
  home.evaluate(`browser.tabs.getCurrent()
    .then((tab) => browser.tabs.update(tab.id, { active: true }))
    .then(() => navigator.clipboard.readText())`)

/** An account, its entries, and a passkey registered through the web's own screen. */
async function anAccountWithItsPasskey(suffix, label, entries = []) {
  const web = firefox.first
  await web.activate()
  const credentials = testCredentials(suffix)
  await register(web, APP_URL, credentials)
  if (entries.length > 0) await createEntries(web, entries)
  await addPasskeyThroughTheScreen(web, credentials, label)
  return credentials
}

/** Unlocks through the popup and fails with what the unlock tab said, if it said anything. */
async function openTheVault(email) {
  const popup = await openPopup()
  if (!(await shows(popup, 'locked'))) throw new Error('the popup did not open locked')

  const stayed = await unlockFrom(popup, email)
  if (stayed) throw new Error(`the unlock tab did not unlock. It says: ${await says(stayed)}`)

  const state = await held()
  if (!state) throw new Error('the unlock tab closed and the background page holds nothing')
  return state
}

/* ── the cases ─────────────────────────────────────────────────────────────────────── */

/*
 * THE CASE THAT JUSTIFIES THE FILE: the passkey the web registered opens the vault, through
 * the unlock tab Firefox needs, with no master password anywhere near the extension.
 *
 * And what must NOT be there: nothing of the key in the extension's storage, which holds
 * the remembered email and nothing else.
 */
async function elPasskeyDeLaWebAbreLaExtension() {
  const notes = []
  const credentials = await anAccountWithItsPasskey('ff-abre', 'Para Firefox')
  notes.push(`account and passkey registered through the web at ${clock()}`)

  const state = await openTheVault(credentials.email)
  notes.push('«Desbloquear» opened the unlock tab, which unlocked and closed itself')

  if (state.email !== credentials.email) throw new Error(`the background page holds «${state.email}»`)
  if (state.extractable !== false) throw new Error(`the key is extractable: ${state.extractable}`)
  notes.push(`the background page holds a non-extractable ${state.algorithm} key`)

  const popup = await openPopup()
  if (!(await shows(popup, 'unlocked'))) throw new Error('a popup opened afterwards finds it locked')
  const account = await popup.evaluate(`document.getElementById('account').textContent`)
  if (account !== credentials.email) throw new Error(`the popup says it is open as «${account}»`)
  notes.push('a popup opened afterwards finds it open, with the right account')

  const stored = await home.evaluate(`Promise.all([browser.storage.local.get(null), browser.storage.session.get(null)]).then(([local, session]) => JSON.stringify({ local: Object.keys(local), session: Object.keys(session) }))`)
  if (stored !== JSON.stringify({ local: ['evault.email'], session: [] })) throw new Error(`the extension stores ${stored}`)
  notes.push('storage holds the remembered email and nothing else')

  await popup.close()
  return notes
}
elPasskeyDeLaWebAbreLaExtension.title = 'the passkey the web registered opens the vault through the unlock tab'

/*
 * A revoked passkey does not open the vault, and the unlock tab says why — with words that
 * do not blame the connection, because the instance answered.
 */
async function unPasskeyRevocadoNoAbre() {
  const notes = []
  const credentials = await anAccountWithItsPasskey('ff-revocado', 'Para revocar')
  const web = firefox.first

  await clickByText(web, /^quitar$/i)
  await clickByText(web, /quitar el passkey/i)
  await waitFor('the passkey to disappear from the list', async () => web.evaluate(`!document.body.innerText.includes('Para revocar')`))
  notes.push('passkey revoked through the web')

  const popup = await openPopup()
  const stayed = await unlockFrom(popup, credentials.email)
  if (!stayed) throw new Error('the unlock tab closed: a revoked passkey opened the vault')

  const message = await says(stayed)
  if (!/no ha aceptado este passkey/.test(message)) throw new Error(`the unlock tab says «${message}»`)
  if (/conexión|red\b/i.test(message)) throw new Error(`it blamed the connection: «${message}»`)
  if (await held()) throw new Error('the background page holds a key after a refused unlock')
  notes.push(`the unlock tab stays open and says «${message}»`)

  await stayed.close()
  return notes
}
unPasskeyRevocadoNoAbre.title = 'a revoked passkey no longer opens the vault'

/*
 * THE CUSTODY OF ADR-025 §2.1: the key lives in the background page and in no page that
 * can close. Every popup that touched it is gone, and the next one still finds it; then
 * locking takes it, and the API refuses its token.
 *
 * And the page survives the lock, which is the Firefox half of it: in Chrome the document
 * closes, and here `window.close()` does nothing (#748), so unlocking again has to work.
 */
async function laClaveViveEnElFondoYSeVaConElBloqueo() {
  const notes = []
  const credentials = await anAccountWithItsPasskey('ff-custodia', 'Para la custodia')

  const state = await openTheVault(credentials.email)
  const open = (await extensionPages()).filter((context) => context.context !== home.context)
  if (open.length > 0) throw new Error(`extension pages still open besides home: ${open.map((c) => c.url).join(', ')}`)
  notes.push('unlocked, and no extension page is left open but the one the script came in through')

  await sleep(5000)
  const popup = await openPopup()
  if (!(await shows(popup, 'unlocked'))) throw new Error('five seconds later, a new popup finds it locked')
  notes.push('five seconds later a new popup still finds it open')

  await popup.evaluate(`(document.getElementById('lock').click(), true)`)
  await waitFor('the background page to forget the key', async () => (await held()) === null)
  await waitFor('the API to refuse the token', async () => (await tokenWorks(state.token, state.vaultId)) === 401, { timeoutMs: 10_000 })
  notes.push('locking forgets the key, and the API refuses its token')

  await popup.close()
  await openTheVault(credentials.email)
  notes.push('and the background page is still there: it unlocks again')

  return notes
}
laClaveViveEnElFondoYSeVaConElBloqueo.title = 'the key lives in the background page and goes with the lock'

/*
 * Copying clears the clipboard half a minute later WITH THE POPUP CLOSED, which is the
 * case that matters: a person copies, closes the popup and pastes. The clearing is the
 * background page's, the same Sweeper as Chrome's offscreen document.
 *
 * The clipboard is read from the home page, which the verification build lets read it.
 */
async function copiarLimpiaElPortapapelesConElPopupCerrado() {
  const notes = []
  const password = 'la-de-copiar-759'
  const credentials = await anAccountWithItsPasskey('ff-copiar', 'Para copiar', [
    { name: 'Entrada de prueba', username: 'ada@example.test', password, url: 'https://ejemplo.test/login' },
  ])
  await openTheVault(credentials.email)

  const copyFrom = async () => {
    const popup = await openPopup()
    await fillField(popup, '#search', 'entrada')
    await waitFor('the entry in the list', async () =>
      popup.evaluate(`Boolean(document.querySelector('button[aria-label="Copiar contraseña de Entrada de prueba"]'))`))
    await popup.evaluate(`(document.querySelector('button[aria-label="Copiar contraseña de Entrada de prueba"]').click(), true)`)
    await waitFor('the popup to say it copied', async () => /copiad/i.test(await says(popup)))
    await popup.close()
    return Date.now()
  }

  const copiedAt = await copyFrom()
  if ((await clipboard()) !== password) throw new Error('the password is not in the clipboard after copying')
  notes.push('copied from the popup, and the popup closed')

  await sleep(Math.max(0, copiedAt + (CLEAR_SECONDS - 5) * 1000 - Date.now()))
  if ((await clipboard()) !== password) throw new Error(`the clipboard was cleared before ${CLEAR_SECONDS - 5} s`)
  notes.push(`still there at ${CLEAR_SECONDS - 5} s: it is not cleared before its time`)

  await waitFor('the clipboard to be emptied', async () => (await clipboard()) === '', { timeoutMs: 15_000 })
  notes.push(`emptied by the background page with the popup closed, at ${((Date.now() - copiedAt) / 1000).toFixed(0)} s`)

  await copyFrom()
  const popup = await openPopup()
  await popup.evaluate(`(document.getElementById('lock').click(), true)`)
  await waitFor('locking to empty the clipboard', async () => (await clipboard()) === '', { timeoutMs: 5_000 })
  notes.push('locking empties it immediately, without waiting out the delay')

  await popup.close()
  return notes
}
copiarLimpiaElPortapapelesConElPopupCerrado.title = 'copying clears the clipboard with the popup closed'

/*
 * Closing the other sessions from the web reaches the extension holding the key (#712),
 * and the web names it as what it is (#753): the name comes from what the Firefox build
 * sent when it unlocked.
 */
async function cerrarLasDemasSesionesBloqueaElPopup() {
  const notes = []
  const credentials = await anAccountWithItsPasskey('ff-sesiones', 'Para las sesiones')
  const state = await openTheVault(credentials.email)
  notes.push('unlocked with the web passkey')

  const web = firefox.first
  await web.activate()
  await web.send('Page.navigate', { url: APP_URL })
  await waitFor('the web to ask for the master password', async () =>
    web.evaluate('location.pathname.startsWith("/unlock") && Boolean(document.querySelector("#password"))'))
  await fillField(web, '#password', credentials.password)
  await web.evaluate(`document.querySelector('form').requestSubmit()`)
  await waitFor('the web to open', async () => isUnlocked(web), { timeoutMs: 120_000 })

  const openMenu = `document.querySelector('aside button[aria-haspopup="menu"]')`
  await waitFor('the user menu', async () => web.evaluate(`Boolean(${openMenu})`))
  await web.evaluate(`(() => { ${openMenu}.click(); return true })()`)
  const entry = `Array.from(document.querySelectorAll('[role="menuitem"]')).find(i => /sesiones abiertas/i.test(i.textContent ?? ''))`
  await waitFor('the open sessions entry in the menu', async () => web.evaluate(`Boolean(${entry})`))
  await web.evaluate(`(() => { ${entry}.click(); return true })()`)

  await waitFor('the extension in the list of open sessions', async () =>
    web.evaluate(`document.body.innerText.includes('Extensión de Firefox')`))
  if (await web.evaluate(`document.body.innerText.includes('Extensión de Chrome')`)) {
    throw new Error('the web also lists a Chrome extension in an account that never had one')
  }
  notes.push('the web lists the session as «Extensión de Firefox», the name the build sent')

  await clickByText(web, /^cerrar las demás sesiones$/i)
  await waitFor('the web to say it closed them', async () =>
    web.evaluate(`/Se ha(n)? cerrado \\d+ sesi/.test(document.querySelector('[role="status"]')?.textContent ?? '')`))
  if ((await tokenWorks(state.token, state.vaultId)) !== 401) throw new Error('the extension\'s token still works')
  notes.push('the API refuses the extension\'s token')

  const popup = await openPopup()
  await waitFor('the popup to lock on the refused token', async () => shows(popup, 'locked'), { timeoutMs: 30_000 })
  await waitFor('the popup to say why', async () => Boolean(await says(popup)))
  const message = await says(popup)
  if (!/ya no es válida/.test(message)) throw new Error(`the popup said «${message}»`)
  if (/conexión|red\b/i.test(message)) throw new Error(`the popup blamed the connection: «${message}»`)
  await waitFor('the background page to forget the key', async () => (await held()) === null)
  notes.push(`locks, forgets the key and says «${message}»`)

  await popup.close()
  return notes
}
cerrarLasDemasSesionesBloqueaElPopup.title = 'closing the other sessions from the web locks the popup'

/** Only that this script can drive the extension at all. */
async function smokeCase() {
  const credentials = await anAccountWithItsPasskey('ff-smoke', 'Smoke')
  await openTheVault(credentials.email)
  return ['registered an account and a passkey in the web, and opened the vault through the unlock tab']
}
smokeCase.title = 'it can drive the extension'

/* ── the run ───────────────────────────────────────────────────────────────────────── */

/**
 * Leaves the extension locked, and with only the home page open, before a case starts.
 * The custody is one per extension: a case that ends unlocked would hand the next one a
 * vault already open with another account in it.
 */
async function cleanSlate() {
  for (const context of await extensionPages()) {
    if (context.context !== home.context) await firefox.page(context.context).close()
  }
  if (await held()) {
    await home.evaluate(`(() => { const c = new BroadcastChannel('evault-custody'); c.postMessage({ op: 'forget', reason: 'manual' }); c.close(); return true })()`)
    await waitFor('the extension to be locked before the case starts', async () => (await held()) === null)
  }
}

const run = async (testCase) => {
  const name = testCase.title
  try {
    await cleanSlate()
    return { name, ok: true, notes: await withVirtualAuthenticator(firefox, () => testCase()) }
  } catch (error) {
    return { name, ok: false, notes: [error.message] }
  }
}

async function main() {
  const reachable = await fetch(APP_URL).then((r) => r.ok).catch(() => false)
  if (!reachable) fail(`the app does not answer at ${APP_URL}. Start the development environment.`)
  log(`app answering at ${APP_URL}`)

  for (const [name, binary] of [['Firefox', FIREFOX], ['geckodriver', GECKODRIVER]]) {
    if (spawnSync(binary, ['--version']).status !== 0) {
      fail(`${name} is not at «${binary}». See SETUP.md: Firefox from Mozilla's APT repository, geckodriver from its releases.`)
    }
  }

  const cases = SMOKE
    ? [smokeCase]
    : [
        elPasskeyDeLaWebAbreLaExtension,
        unPasskeyRevocadoNoAbre,
        laClaveViveEnElFondoYSeVaConElBloqueo,
        copiarLimpiaElPortapapelesConElPopupCerrado,
        cerrarLasDemasSesionesBloqueaElPopup,
      ]

  const quota = await checkRegistrationQuota(APP_URL, cases.length)
  if (!quota.ok) fail(quota.message)
  log(quota.message)

  buildExtension()

  firefox = await startFirefox({
    firefox: FIREFOX,
    geckodriver: GECKODRIVER,
    port: DRIVER_PORT,
    webSocketPort: BIDI_PORT,
    prefs: {
      // Without it no registration works at all, not even one without PRF (#750).
      'security.webauth.webauthn_enable_softtoken': true,
      'security.webauth.webauthn_enable_usbtoken': false,
      'extensions.webextensions.uuids': JSON.stringify({ [EXTENSION_ID]: UUID }),
    },
  }).catch((error) => fail(`Firefox did not start: ${error.message}`))

  try {
    log(`Firefox ${await firefox.first.evaluate('navigator.userAgent.match(/Firefox\\/[\\d.]+/)[0]')} under geckodriver`)
    await firefox.bidi('webExtension.install', { extensionData: { type: 'path', path: DIST } })
    await waitFor('the extension to open its home page', async () => {
      const page = (await extensionPages())[0]
      if (page) home = firefox.page(page.context)
      return Boolean(page)
    })
    log(`extension installed, home page at ${POPUP}`)

    // Sequential, for the reasons verify-extension gives: one limiter per IP, one custody.
    const results = []
    for (const testCase of cases) {
      results.push(await run(testCase))
      log(`${testCase.title}: ${results.at(-1).ok ? 'verde' : 'ROJO'}`)
    }

    report(results)
    process.exitCode = results.some((r) => !r.ok) ? 1 : 0
  } finally {
    await firefox.stop()
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
