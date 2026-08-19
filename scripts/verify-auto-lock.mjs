#!/usr/bin/env node
/**
 * Verifies that the vault locks itself, in a real browser and with the clock running.
 *
 * WHY THIS EXISTS — #281. The inactivity lock went two whole iterations unverified,
 * and not for a technical reason: checking it by hand costs an hour of clock split
 * into four fifteen-minute waits in front of a screen. A criterion that costs that
 * gets postponed every time, and this project already has the lesson written down —
 * the path nobody walks is the one that is broken.
 *
 * THE ONE THING THIS MUST NOT DO IS FAKE TIME. No Emulation.setVirtualTimePolicy, no
 * patching Date.now(). That would reproduce exactly what the 24 unit tests of #220
 * already cover, and turn the criterion into a reassuring zero with a different shape.
 * Fifteen real minutes. Having a machine wait them instead of a person IS the point.
 *
 * WHAT IT DOES NOT COVER, and it is not an oversight: the case of a genuinely hidden
 * tab. Measured while closing #281 — in headless Chromium, activating another tab does
 * not hide the first one: visibilityState stays "visible" and a 1s interval still
 * ticks 12 times in 12 seconds, so there is no throttling to observe. Real visibility
 * turned out to depend on the desktop window manager rather than on anything CDP can
 * drive. That case stays manual, in #260, together with the mobile one that was always
 * going to be.
 *
 * Usage:
 *   node scripts/verify-auto-lock.mjs                    # the real thing, ~19 minutes
 *   node scripts/verify-auto-lock.mjs --smoke            # only that it can drive the app
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   CHROMIUM         browser binary (default chromium-browser)
 *
 * The URL must be localhost or an https origin: without a secure context there is no
 * crypto.subtle, so the vault cannot even be registered.
 */

import { spawn } from 'node:child_process'
import { attach, clock, sleep, waitFor } from './auto-lock/cdp.mjs'
import { hasWarning, isLocked, isUnlocked, poke, register, snapshot, testCredentials } from './auto-lock/vault.mjs'

const APP_URL = process.env.EVAULT_APP_URL ?? 'http://localhost:5173'
const CHROMIUM = process.env.CHROMIUM ?? 'chromium-browser'
const SMOKE = process.argv.includes('--smoke')
const PORT = 9411

/*
 * THE EXPECTED TIMES ARE FIXED, NOT READ FROM THE CODE, and that is the whole
 * difference between a check and an ornament. If they were derived from
 * INACTIVITY_LIMIT_MS, raising that constant to an hour would just make this script
 * slower and still green. Written down here, that mutation leaves the warning absent
 * at minute 14 and the vault unlocked at minute 15, which is red — which is exactly
 * what the acceptance criterion of #281 asks to verify.
 */
const MINUTE = 60_000
const EXPECT_WARNING_AT = 14 * MINUTE
const EXPECT_LOCK_AT = 15 * MINUTE
const SETTLE = 45_000

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
  const browser = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    // Off on purpose: Chromium slows down timers in backgrounded windows, and every
    // tab here is a window as far as headless is concerned. Leaving it on would make
    // the parallel cases measure the throttling instead of the lock.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: 'ignore' })

  try {
    await waitFor('the browser to expose CDP', async () =>
      fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok).catch(() => false))
    log('browser up')

    await assertTabsAreNotThrottled()

    const cases = SMOKE ? [smokeCase] : [foregroundLocks, warningClearsOnActivity, typingKeepsItOpen]
    const results = await Promise.all(cases.map(run))

    report(results)
    process.exitCode = results.some((r) => !r.ok) ? 1 : 0
  } finally {
    browser.kill()
  }
}

/**
 * Confirms the anti-throttling flags actually took effect.
 *
 * BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT PROVE, because the first version of this
 * comment claimed more than the code delivers. It does NOT measure an independent
 * premise: --disable-background-timer-throttling is passed a few lines above, so a
 * green result here is largely the flag working, not the browser behaving that way on
 * its own. Checking the effect of your own flag and calling it a measurement is the
 * shape of "a test can agree with the code for the wrong reason" (#265).
 *
 * What it is still worth having: flags get renamed and removed between Chromium
 * releases. The three cases run in parallel tabs so the whole run takes 19 minutes
 * instead of 50, and that is only sound while background tabs tick like foreground
 * ones. The day the flag stops working, this fails here with a sentence that says why
 * — instead of the cases failing 15 minutes later for a reason nobody would guess.
 */
async function assertTabsAreNotThrottled() {
  const [front, back] = await Promise.all([newTab(), newTab()])
  await front.send('Page.bringToFront')
  await back.evaluate('window.__ticks = 0; setInterval(() => window.__ticks++, 1000); "ok"')
  await sleep(10_000)
  const ticks = await back.evaluate('window.__ticks')
  front.close()
  back.close()

  if (ticks < 8) {
    fail(`background tabs ARE being throttled despite --disable-background-timer-throttling
  (${ticks} ticks in 10s, expected ~10). The flag was probably renamed or dropped.
  Running the cases in parallel would measure the throttling instead of the lock, so
  either fix the flag or run the cases one at a time.`)
  }
  log(`anti-throttling flags in effect (${ticks} ticks in 10s)`)
}

async function newTab() {
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
  return attach(target.webSocketDebuggerUrl)
}

const run = async (testCase) => {
  const name = testCase.title
  try {
    const page = await newTab()
    try {
      const notes = await testCase(page)
      return { name, ok: true, notes }
    } finally {
      page.close()
    }
  } catch (error) {
    return { name, ok: false, notes: [error.message] }
  }
}

/** Case 2 of #281: foreground, untouched — warning at 14, locked at 15. */
async function foregroundLocks(page) {
  const notes = []
  const credentials = testCredentials('caso2')
  await register(page, APP_URL, credentials)
  const opened = Date.now()
  notes.push(`vault opened at ${clock(new Date(opened))}`)

  await sleepUntil(opened + EXPECT_WARNING_AT + SETTLE, 'the warning')
  if (!(await hasWarning(page))) {
    throw new Error(`expected the warning to be showing ${minutesSince(opened)} min after opening, and it was not.
    That is what raising INACTIVITY_LIMIT_MS looks like from here.
${await snapshot(page)}`)
  }
  notes.push(`warning present at ${clock()} (${minutesSince(opened)} min)`)

  await sleepUntil(opened + EXPECT_LOCK_AT + SETTLE, 'the lock')
  if (!(await isLocked(page))) {
    throw new Error(`expected the vault to be locked ${minutesSince(opened)} min after opening.
${await snapshot(page)}`)
  }
  notes.push(`locked at ${clock()} (${minutesSince(opened)} min)`)
  return notes
}
foregroundLocks.title = 'caso 2 — en primer plano y sin tocar nada: avisa a los 14 y bloquea a los 15'

/** Case 3 of #281: interacting clears the warning, and the vault does NOT lock afterwards. */
async function warningClearsOnActivity(page) {
  const notes = []
  await register(page, APP_URL, testCredentials('caso3'))
  const opened = Date.now()

  await sleepUntil(opened + EXPECT_WARNING_AT + SETTLE, 'the warning')
  if (!(await hasWarning(page))) {
    throw new Error(`expected the warning ${minutesSince(opened)} min after opening, and it was not showing
${await snapshot(page)}`)
  }
  notes.push(`warning present at ${clock()}`)

  await poke(page)
  try {
    await waitFor('the warning to go away after interacting', async () => !(await hasWarning(page)), { timeoutMs: 10_000 })
  } catch (error) {
    throw new Error(`${error.message}
    A keystroke should clear it: markActivity() dismisses the toast by id.
${await snapshot(page)}`)
  }
  notes.push(`warning cleared by a keystroke at ${clock()}`)

  // Past the original deadline: if activity did not reset the countdown, this locks.
  await sleepUntil(opened + EXPECT_LOCK_AT + 2 * MINUTE, 'the original deadline to pass')
  if (await isLocked(page)) {
    throw new Error(`the vault locked ${minutesSince(opened)} min after opening despite the keystroke.
    Activity is not resetting the countdown, which would lock people out mid-typing.
${await snapshot(page)}`)
  }
  notes.push(`still unlocked at ${clock()} (${minutesSince(opened)} min), past the original deadline`)
  return notes
}
warningClearsOnActivity.title = 'caso 3 — el aviso se retira al interactuar y la vault no se bloquea'

/** Case 4 of #281: typing every few minutes never lets the lock fire. */
async function typingKeepsItOpen(page) {
  const notes = []
  await register(page, APP_URL, testCredentials('caso4'))
  const opened = Date.now()
  const until = opened + 18 * MINUTE

  while (Date.now() < until) {
    await sleep(Math.min(3 * MINUTE, until - Date.now()))
    await poke(page)
    if (await isLocked(page)) {
      throw new Error(`the vault locked ${minutesSince(opened)} min in, while being typed into every 3 minutes.
    This is the worst failure mode of the feature: locking someone mid-entry.
${await snapshot(page)}`)
    }
    if (await hasWarning(page)) {
      throw new Error(`the warning appeared ${minutesSince(opened)} min in despite typing every 3 minutes
${await snapshot(page)}`)
    }
  }
  notes.push(`typed every 3 min for ${minutesSince(opened)} min: never locked, never warned`)
  return notes
}
typingKeepsItOpen.title = 'caso 4 — escribir cada pocos minutos no deja que salte'

/** Only proves the script can drive the app. It does NOT verify the lock, and says so. */
async function smokeCase(page) {
  await register(page, APP_URL, testCredentials('smoke'))
  if (!(await isUnlocked(page))) {
    throw new Error('registered but the vault did not open')
  }
  await poke(page)
  return ['registered, vault open, keystroke delivered — NOTHING about the lock was verified']
}
smokeCase.title = 'smoke — solo que el guion sabe conducir la aplicación'

const minutesSince = (from) => ((Date.now() - from) / MINUTE).toFixed(1)

async function sleepUntil(when, what) {
  const remaining = when - Date.now()
  if (remaining > 0) {
    log(`waiting ${Math.round(remaining / 1000)}s for ${what}`)
    await sleep(remaining)
  }
}

function report(results) {
  console.log('\n' + '─'.repeat(78))
  for (const { name, ok, notes } of results) {
    console.log(`${ok ? '✓' : '✗'} ${name}`)
    for (const note of notes) {
      console.log(`    ${note}`)
    }
  }
  const failed = results.filter((r) => !r.ok).length
  console.log('─'.repeat(78))
  console.log(failed ? `${failed} de ${results.length} en rojo.` : `${results.length} de ${results.length} en verde.`)
  console.log(`Duración total: ${(since() / 60).toFixed(1)} min`)
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

await main()
