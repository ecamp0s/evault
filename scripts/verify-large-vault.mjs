#!/usr/bin/env node
/**
 * Measures what a vault with hundreds of entries costs, in a real browser. See #348.
 *
 * WHY THIS EXISTS. The Iteration 11 planning found six defects by doing something
 * nobody had done: using the app with 370 entries in it. None of them is visible in
 * the code, and none of them is caught by the suite — the list tests mount three
 * items, so the list has never been slow in a test. The vault where the real
 * passwords live has had 370 entries since Iteration 7, and the numbers were:
 *
 *   the user menu 27.464 px down the page, with the window at 900
 *   4 min 19 s and 741 requests to import 370 entries
 *   2.657 ms to paint the list, of which 77 were the request and 25 the decryption
 *   773 ms for the first keystroke in the search box
 *   1.191 ms and two requests to delete one entry
 *
 * WHAT THIS COMMAND IS FOR is that none of that can come back quietly. A `useMemo`
 * that stops applying, an `invalidateQueries` added to a new mutation out of habit,
 * and the vault is slow again with the whole suite green.
 *
 * IT IS WRITTEN BEFORE THE FIXES, ON PURPOSE. That is the lesson of #316: the census
 * went in before the first line was converted, because the failure mode of that work
 * was invisible to everything that already existed. Same here. A bench written
 * afterwards would be calibrated against whatever the code happens to do.
 *
 * SO IT IS SUPPOSED TO BE RED TODAY. Run against `master` before #349 to #354 land,
 * five of its six checks fail. A bench that comes out green on the code it was written
 * to measure is not measuring it.
 *
 * WHAT DECIDES AND WHAT ONLY INFORMS is in `browser/limits.mjs`, and it is the part
 * worth reading before trusting a green run: counts decide, clocks only inform,
 * because a millisecond threshold measured on one laptop goes red on a slower machine
 * while nothing is worse.
 *
 * Usage:
 *   node scripts/verify-large-vault.mjs                 # 370 entries, the real thing
 *   node scripts/verify-large-vault.mjs --entries 120   # quicker, same checks
 *   node scripts/verify-large-vault.mjs --smoke         # only that it can drive the app
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   CHROMIUM         browser binary (default chromium-browser)
 *
 * It needs the Vite dev server and the API behind it, exactly like
 * `verify-auto-lock.mjs`:
 *
 *   from api/:  php artisan serve --port=8000
 *   from web/:  DEV_API_PROXY=http://127.0.0.1:8000 npm run dev
 *
 * and `localhost:5173` rather than `app.evault.localhost`, because the dev server's
 * `/api` proxy resolves through 127.0.0.1.
 *
 * IT REGISTERS TWO ACCOUNTS PER RUN and the API allows ten registrations per hour per
 * IP (#25), so five runs in an hour hit the limit and the sixth fails at setup. The
 * message says so when it happens.
 *
 * NOT IN CI, and that is deliberate. It seeds hundreds of entries and drives a
 * browser; running it on every PR would make it flaky, and a flaky check gets ignored
 * whole — the lesson of #62. It is a command to run by hand when touching the list,
 * like the one for the inactivity lock.
 */

import { spawn } from 'node:child_process'
import { attach, clock, waitFor } from './browser/cdp.mjs'
import { register, testCredentials } from './browser/vault.mjs'
import { evaluate, failed, SMALL } from './browser/limits.mjs'
import {
  chromeCsv, measureAudit, measureDelete, measureImport, measureLayout, measureSearch,
  measureUnlockAndPaint, requestCount, seed, startCountingRequests,
} from './browser/largeVault.mjs'

const APP_URL = process.env.EVAULT_APP_URL ?? 'http://localhost:5173'
const CHROMIUM = process.env.CHROMIUM ?? 'chromium-browser'
const SMOKE = process.argv.includes('--smoke')
const PORT = 9413

/*
 * 370 because that is how many entries the real vault holds, and the whole point is to
 * measure the size that actually exists rather than a round number. Overridable
 * because iterating on this script at 370 costs minutes of seeding per attempt.
 */
const ENTRIES = (() => {
  const at = process.argv.indexOf('--entries')
  const value = at === -1 ? 370 : Number(process.argv[at + 1])
  if (!Number.isInteger(value) || value <= SMALL) {
    fail(`--entries must be a whole number greater than ${SMALL}; got ${process.argv[at + 1]}`)
  }
  return value
})()

/* A window with a real desktop height. The user menu check is meaningless without one. */
const VIEWPORT = { width: 1440, height: 900 }

const started = Date.now()
const since = () => Math.round((Date.now() - started) / 1000)
const log = (...parts) => console.log(`[${clock()}] [+${String(since()).padStart(4)}s]`, ...parts)

async function main() {
  const response = await fetch(APP_URL).catch(() => null)
  if (!response?.ok) {
    fail(`the app does not answer at ${APP_URL}.
  Start it with, from web/:   DEV_API_PROXY=http://127.0.0.1:8000 npm run dev
  and the API with, from api/: php artisan serve --port=8000`)
  }
  log(`app answering at ${APP_URL}`)

  const browser = await launchBrowser(PORT)

  try {
    if (SMOKE) {
      await smoke(browser)
      return
    }

    const measurements = await measureEverything(browser)
    const findings = evaluate(measurements)

    report(measurements, findings)
    process.exitCode = failed(findings) ? 1 : 0
  } finally {
    browser.kill()
  }
}

/**
 * The two vaults this needs, and why they are two accounts.
 *
 * THE LIST MEASUREMENTS NEED THE SAME VAULT AT TWO SIZES. Every clock limit is a ratio
 * between painting N entries and painting ten, and a ratio only cancels out the
 * machine if both halves ran on it minutes apart — not on some other laptop last
 * August. So account A is measured at ten entries, grown to N, and measured again.
 *
 * THE IMPORT NEEDS AN EMPTY VAULT, which is both the honest scenario — importing is
 * what someone does on their first day — and a requirement: the importer unticks
 * duplicates by default, so importing into a vault that already holds those entries
 * would faithfully measure writing nothing at all.
 */
async function measureEverything(browser) {
  const list = await browser.newTab()
  await list.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false })

  const credentials = testCredentials('vault-larga')
  await register(list, APP_URL, credentials)
  await startCountingRequests(list)
  log(`account registered, empty vault open`)

  const small = await sizeAndMeasure(list, credentials, { from: 0, count: SMALL, label: `${SMALL} entradas` })
  const large = await sizeAndMeasure(list, credentials, { from: SMALL, count: ENTRIES - SMALL, label: `${ENTRIES} entradas` })

  /*
   * Before deleting anything, because deleting changes what the audit would find and
   * this measurement is about the screen and not about which entries it lists.
   */
  const audit = await measureAudit(list)
  log(`review: ${audit.flagged} of ${audit.audited} flagged, ${audit.rows} rows, ${audit.domNodes} DOM nodes in ${audit.ms} ms`)

  await list.send('Page.navigate', { url: APP_URL })
  await measureUnlockAndPaint(list, credentials.password)
  await startCountingRequests(list)

  const deletion = await measureDelete(list)
  log(`delete: ${deletion.requests} request(s), ${deletion.ms} ms`)
  list.close()

  const importing = await browser.newTab()
  await importing.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false })
  await register(importing, APP_URL, testCredentials('import'))
  await startCountingRequests(importing)
  log(`second account registered, measuring the import of ${ENTRIES} entries — this is the slow one`)

  const imported = await measureImport(importing, chromeCsv(ENTRIES))
  log(`import: ${imported.requests} requests, ${(imported.ms / 1000).toFixed(1)} s`)
  importing.close()

  if (imported.previewed !== ENTRIES) {
    throw new Error(`the dialog read ${imported.previewed} entries out of a ${ENTRIES}-entry file`)
  }

  return { entries: ENTRIES, small, large, audit, delete: deletion, import: imported }
}

/** Grows the vault, reloads so it locks, unlocks it timing the paint, and measures. */
async function sizeAndMeasure(page, credentials, { from, count, label }) {
  const seeded = await seed(page, { count, offset: from })
  log(`seeded ${seeded.seeded} entries in ${(seeded.ms / 1000).toFixed(1)} s (${label})`)

  /*
   * Reloading is not a detour: ADR-007 says the key lives only in memory, so a reload
   * locks the vault. It is the only way to time an unlock, and it is also what a person
   * does every morning.
   */
  await page.send('Page.navigate', { url: APP_URL })
  const { totalMs, paintMs } = await measureUnlockAndPaint(page, credentials.password)
  await startCountingRequests(page)

  const searchMs = await measureSearch(page)
  const layout = await measureLayout(page)
  const dialogFocus = await measureDialogFocus(page)

  log(`${label}: ${totalMs} ms to unlock and show (${paintMs} of them painting), ${searchMs} ms to search, ${layout.domNodes} DOM nodes, ${layout.rows} rows on screen`)

  return { totalMs, paintMs, searchMs, dialogFocus, ...layout }
}

/**
 * Whether closing a dialog hands the focus back to the button that opened it (#360).
 *
 * IT IS MEASURED HERE AND NOT IN THE SUITE BECAUSE JSDOM CANNOT SEE IT. A test was
 * written there first and thrown away: it passed with the fix and passed again with the
 * fix mutated out, so it guarded nothing at all.
 *
 * The row is opened by focusing its button and pressing Enter rather than by clicking,
 * which is the case that matters: whoever is navigating with the keyboard over 370
 * entries and gets dropped on `document.body` has to tab through the whole list again.
 */
async function measureDialogFocus(page) {
  const opened = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label')?.startsWith('Editar'))
    if (!button) return false
    button.focus()
    button.click()
    return true
  })()`)

  if (!opened) return { returned: false, landedOn: 'no había ninguna entrada que abrir' }

  await waitFor('the dialog to open', async () =>
    page.evaluate(`document.querySelector('[role=dialog]') !== null`))

  await page.evaluate(`(() => {
    const cancel = [...document.querySelectorAll('[role=dialog] button')]
      .find((b) => b.textContent?.trim() === 'Cancelar')
    cancel?.click()
  })()`)

  await waitFor('the dialog to close', async () =>
    page.evaluate(`document.querySelector('[role=dialog]') === null`))

  return page.evaluate(`(() => {
    const active = document.activeElement
    const label = active?.getAttribute('aria-label') ?? ''
    return {
      returned: label.startsWith('Editar'),
      landedOn: active === document.body ? 'el body' : (label || active?.tagName || 'nada'),
    }
  })()`)
}

/** Only proves the script can drive the app. It measures nothing, and says so. */
async function smoke(browser) {
  const page = await browser.newTab()
  await page.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false })

  const credentials = testCredentials('smoke-larga')
  await register(page, APP_URL, credentials)
  await startCountingRequests(page)

  const seeded = await seed(page, { count: SMALL, offset: 0 })
  await page.send('Page.navigate', { url: APP_URL })
  const { totalMs } = await measureUnlockAndPaint(page, credentials.password)
  // Reinstalled after the navigation, which took the previous counter with it. The
  // smoke run exercises that too, so a broken counter shows up in twenty seconds
  // instead of in the middle of a full run.
  await startCountingRequests(page)
  const layout = await measureLayout(page)

  if (layout.rows < 1) {
    throw new Error(`seeded ${seeded.seeded} entries but the list shows none`)
  }

  console.log(`\n✓ smoke — el guion sabe conducir la aplicación`)
  console.log(`    ${seeded.seeded} entradas sembradas en ${(seeded.ms / 1000).toFixed(1)} s, ${layout.rows} en pantalla`)
  console.log(`    ${totalMs} ms hasta desbloquear y ver la lista, ${await requestCount(page)} peticiones contadas`)
  console.log(`    NO se ha verificado ninguno de los seis límites\n`)
  page.close()
}

async function launchBrowser(port) {
  const process_ = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    /*
     * The same anti-throttling flags as the lock verification, for the opposite
     * reason: nothing here is about throttling, and a tab that gets throttled while
     * seeding would turn a slow seed into a measurement of Chromium's power saving.
     */
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' })

  await waitFor(`the browser on ${port} to expose CDP`, async () =>
    fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false))
  log(`browser up on ${port}`)

  return {
    newTab: async () => {
      const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
      return attach(target.webSocketDebuggerUrl)
    },
    kill: () => process_.kill(),
  }
}

function report(measurements, findings) {
  console.log('\n' + '─'.repeat(78))
  console.log(`Vault de ${measurements.entries} entradas, contra una de ${SMALL} en la misma máquina y la misma ejecución.`)
  console.log('─'.repeat(78))

  for (const { title, ok, detail, structural } of findings) {
    console.log(`${ok ? '✓' : '✗'} ${title}${structural ? '' : '  (informativo)'}`)
    console.log(`    ${detail}`)
  }

  console.log('─'.repeat(78))
  const red = findings.filter((f) => !f.ok)
  const decisive = red.filter((f) => f.structural)
  const informative = red.filter((f) => !f.structural)

  /*
   * How many are wrong and how many decide are two different counts, and saying them
   * as one was the flaw in the first version of this summary: with all six limits over
   * their margin it printed "4 de 6 en rojo", which reads as though two were fine.
   */
  if (decisive.length) {
    console.log(`${red.length} de ${findings.length} por encima de su margen.`)
    console.log(`Deciden ${decisive.length}, y ponen esta ejecución en rojo: ${decisive.map((f) => f.id).join(', ')}.`)
    if (informative.length) {
      console.log(`Los otros ${informative.length} son de reloj y no deciden — aquí acompañan, no acusan.`)
    }
  } else if (informative.length) {
    console.log(`Los ${findings.length - informative.length} límites que deciden, en verde.`)
    console.log(`${informative.length} de reloj por encima de su margen: ${informative.map((f) => f.id).join(', ')}.`)
    console.log(`Puede ser esta máquina y no el código, así que se mira; no se da por roto.`)
  } else {
    console.log(`Los ${findings.length} límites en verde.`)
  }

  console.log(`Duración total: ${(since() / 60).toFixed(1)} min`)
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

await main()
