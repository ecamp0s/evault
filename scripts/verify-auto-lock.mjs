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
 * WHAT IT DOES NOT COVER: a genuinely hidden tab, left to #260 with the mobile case.
 *
 * BE PRECISE ABOUT WHY, because the first version of this comment got it wrong and the
 * wrong version is far more discouraging than the truth. What was measured while
 * closing #281 is that `/json/activate` and `Page.bringToFront` do NOT hide the tab
 * they move away from. The conclusion drawn from it — "headless cannot have a hidden
 * tab" — was a generalisation, and it is false: opening a NEW tab does hide the
 * previous one, and with four tabs open three report visibilityState "hidden". That is
 * how #305 came to be diagnosed at all.
 *
 * So the missing piece is smaller than it looked: a hidden tab is reachable, and what
 * stays unverified is whether fifteen minutes of it produce REAL throttling. Chromium
 * applies intensive throttling after five minutes hidden, so the twelve-second probe
 * that was run could not have seen it either way.
 *
 * Usage:
 *   node scripts/verify-auto-lock.mjs                    # the real thing, ~19 minutes
 *   node scripts/verify-auto-lock.mjs --smoke            # only that it can drive the app
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   CHROMIUM         browser binary (default chromium-browser)
 *
 * IT REGISTERS FOUR ACCOUNTS PER RUN, and the API allows ten registrations per hour
 * per IP (#25). Two runs back to back therefore hit the limit, and the third fails at
 * setup with "algo ha ido mal" — which looks nothing like a rate limit fifteen minutes
 * later. register() says so explicitly when it happens. To iterate on the script,
 * raise THROTTLE_REGISTER_ATTEMPTS in the API's .env; do not lower the limit anywhere
 * that is not a development machine.
 *
 * The URL must be localhost or an https origin: without a secure context there is no
 * crypto.subtle, so the vault cannot even be registered.
 */

import { spawn } from 'node:child_process'
import { attach, clock, sleep, waitFor } from './auto-lock/cdp.mjs'
import {
  dialogIsOpen, dialogText, hasWarning, isLocked, isUnlocked, openNewEntryDialog,
  poke, register, snapshot, testCredentials, typeInDialog,
} from './auto-lock/vault.mjs'

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
/*
 * Margin added on top of an expected instant before asserting. Only used where the
 * assertion is about something that STAYS true — the vault being locked — never for
 * catching the warning, which only exists for the sixty seconds before the lock and
 * has to be watched for instead.
 */
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

    const cases = SMOKE ? [smokeCase] : [foregroundLocks, warningClearsOnActivity, typingKeepsItOpen, typingInADialogKeepsItOpen]
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

  /*
   * Watched for from just before minute 14 rather than sampled at a fixed instant.
   * The warning only lives for the sixty seconds before the lock, so a single late
   * sample can miss it and report "no warning" when there was one — the same drift
   * that made case 3 fail. The timeout is what turns a raised INACTIVITY_LIMIT_MS
   * into a red result.
   */
  await sleepUntil(opened + EXPECT_WARNING_AT - 30_000, 'the warning window to open')
  try {
    await waitFor('the warning to appear', () => hasWarning(page), { timeoutMs: 2 * MINUTE, everyMs: 500 })
  } catch (error) {
    throw new Error(`${error.message}
    Expected it around minute 14. That is what raising INACTIVITY_LIMIT_MS looks like from here.
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

  /*
   * CATCH THE WARNING AS SOON AS IT APPEARS, instead of sleeping to a fixed instant.
   *
   * The window this case needs is the sixty seconds between the warning (minute 14)
   * and the lock (minute 15), and it needs to interact INSIDE it. Sleeping to
   * 14 min 45 s left fifteen seconds — and once the drift of a slow registration was
   * added on top, the check landed at minute 15.0 with the lock already firing. The
   * failure looked like "activity does not reset the countdown", which would have been
   * a serious product bug, and was in fact this script arriving late.
   */
  await sleepUntil(opened + EXPECT_WARNING_AT - 30_000, 'the warning window to open')
  await waitFor('the warning to appear', () => hasWarning(page), { timeoutMs: 2 * MINUTE, everyMs: 500 })
  notes.push(`warning present at ${clock()} (${minutesSince(opened)} min)`)

  /*
   * THE TAB HAS TO BE VISIBLE FOR THIS PARTICULAR CHECK, and skipping this is what
   * made case 3 fail intermittently until #305 was diagnosed.
   *
   * Chromium does not repaint hidden tabs. Sonner's toast is INSERTED into the DOM
   * fine while hidden — which is why case 2 sees the warning appear — but its removal
   * rides on an exit animation, and that never runs. So `toast.dismiss()` did its job,
   * the toast was logically gone, and the DOM still showed it: the script was reading
   * a frozen picture and calling it a bug in the vault.
   *
   * Measured, not guessed: with four tabs open, three report visibilityState "hidden";
   * bringing the tab to the front made the toast disappear immediately.
   *
   * Doing it here does not weaken anything. What this case tests is that a keystroke
   * clears the warning, and a person clearing a warning is by definition looking at
   * the screen. It also does not disturb the other cases: the only thing they need
   * from the DOM is a toast APPEARING, which works fine hidden.
   */
  await page.send('Page.bringToFront')
  await sleep(500)

  await poke(page)
  try {
    /*
     * "No warning on screen" is TRUE when the vault has locked, because locking
     * unmounts the whole tree. So the absence has to come with the vault still open,
     * or this passes for the wrong reason — which it did before this guard.
     */
    await waitFor('the warning to go away with the vault still open', async () =>
      !(await hasWarning(page)) && !(await isLocked(page)), { timeoutMs: 10_000 })
  } catch (error) {
    throw new Error(`${error.message}
    A keystroke should clear it: markActivity() dismisses the toast by id.
    The tab was brought to the front first, so this is not the repaint issue of #305.
    visibilityState: ${await page.evaluate('document.visibilityState')}
${await snapshot(page)}`)
  }
  notes.push(`warning cleared by a keystroke at ${clock()}`)

  // Past the original deadline: if activity did not reset the countdown, this locks.
  // Measured from the keystroke, not from opening, because that is what reset it.
  const poked = Date.now()
  await sleepUntil(poked + 2 * MINUTE, 'the original deadline to pass')
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

/**
 * Case 5 of the verification, added in #304: typing INSIDE an open dialog.
 *
 * Not the same risk as case 4, and neither replaces the other. Case 4 delivers
 * keystrokes to the window; this one types into a field rendered in a portal, which is
 * the only way to prove the event reaches the window listener from there. If it ever
 * stops reaching it, the vault locks on top of someone writing a long entry — and
 * #303 already recorded that whatever they had written is gone with it.
 */
async function typingInADialogKeepsItOpen(page) {
  const notes = []
  await register(page, APP_URL, testCredentials('caso5'))
  const opened = Date.now()

  await openNewEntryDialog(page)
  notes.push(`dialog open at ${clock()}`)
  const until = opened + 18 * MINUTE

  while (Date.now() < until) {
    await sleep(Math.min(3 * MINUTE, until - Date.now()))

    if (!(await dialogIsOpen(page))) {
      throw new Error(`the dialog is gone ${minutesSince(opened)} min in, so nothing was being typed into.
    A green result here would have proved nothing at all.
${await snapshot(page)}`)
    }

    await typeInDialog(page, 'nota ')

    if (await isLocked(page)) {
      throw new Error(`the vault locked ${minutesSince(opened)} min in while text was being typed INTO THE DIALOG.
    Keystrokes are not reaching the window listener from inside the portal, which locks
    people out mid-entry and discards what they wrote (#303).
${await snapshot(page)}`)
    }
    if (await hasWarning(page)) {
      throw new Error(`the warning appeared ${minutesSince(opened)} min in despite typing into the dialog every 3 minutes
${await snapshot(page)}`)
    }
  }

  // The text is the receipt: without it, a case that typed into nothing would pass.
  const written = await dialogText(page)
  if (!written.includes('nota')) {
    throw new Error(`typed for ${minutesSince(opened)} min but the field holds ${JSON.stringify(written)}.
    The keystrokes were not landing in the dialog, so this case was not testing anything.`)
  }
  notes.push(`typed into the dialog every 3 min for ${minutesSince(opened)} min: never locked, never warned`)
  notes.push(`field holds ${written.length} characters, so the keystrokes did land`)
  return notes
}
typingInADialogKeepsItOpen.title = 'caso 5 — escribir DENTRO de un diálogo abierto tampoco deja que salte'

/** Only proves the script can drive the app. It does NOT verify the lock, and says so. */
async function smokeCase(page) {
  await register(page, APP_URL, testCredentials('smoke'))
  if (!(await isUnlocked(page))) {
    throw new Error('registered but the vault did not open')
  }
  await poke(page)

  // The dialog path too, because it is the one with moving parts: a button found by
  // its text and a field inside a portal.
  await openNewEntryDialog(page)
  await typeInDialog(page, 'smoke')
  const written = await dialogText(page)
  if (!written.includes('smoke')) {
    throw new Error(`typed into the dialog but the field holds ${JSON.stringify(written)}`)
  }

  return [`registered, vault open, typed ${JSON.stringify(written)} into the dialog — NOTHING about the lock was verified`]
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
