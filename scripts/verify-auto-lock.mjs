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
 * WHAT IT DOES NOT COVER: the mobile case, which stays manual in #260. No desktop
 * browser reproduces how iOS suspends a backgrounded tab, and that is the scenario
 * most likely to break.
 *
 * The hidden-tab case DID end up automated, in case 1, and getting there took undoing
 * a wrong conclusion of its own: `/json/activate` and `Page.bringToFront` do not hide
 * the tab they move away from, and from that it was concluded that headless could not
 * hide a tab at all. Opening a NEW tab does. And once hidden, Chromium throttles for
 * real — measured at 60 ticks/min for the first minutes and 1 tick/min from minute
 * six, which is the throttling this feature was designed to survive.
 *
 * Usage:
 *   node scripts/verify-auto-lock.mjs                    # the real thing, ~19 minutes
 *   node scripts/verify-auto-lock.mjs --smoke            # only that it can drive the app
 *
 * Environment:
 *   EVAULT_APP_URL   where the SPA is served (default http://localhost:5173)
 *   CHROMIUM         browser binary (default chromium-browser)
 *
 * IT REGISTERS FIVE ACCOUNTS PER RUN, and the API allows ten registrations per hour
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
import { attach, clock, sleep, waitFor } from './browser/cdp.mjs'
import {
  dialogIsOpen, dialogText, generateRecoveryKey, hasWarning, isLocked, isUnlocked,
  openNewEntryDialog, poke, recoveryKeyIsOnScreen, register, snapshot, testCredentials,
  toastTexts, totpOnScreen, typeInDialog, typeTotpSeed,
} from './browser/vault.mjs'

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

/*
 * The RFC 6238 seed. Any valid one would do — what case 8 needs is a counter that runs,
 * not a particular code — and using the published one keeps it recognisable.
 */
const TOTP_SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

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

  /*
   * TWO BROWSERS, and the reason is that one case needs the opposite of the others.
   *
   * Cases 2 to 5 and 7 run in parallel tabs, which is only sound while background tabs
   * tick like foreground ones — hence the anti-throttling flags. Case 1 exists precisely
   * to live through the throttling, so it gets its own browser without them.
   */
  const main = await launchBrowser(PORT, [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ])

  const throttled = SMOKE ? null : await launchBrowser(PORT + 1, [])

  try {
    await assertTabsAreNotThrottled(main)

    const cases = SMOKE
      ? [[smokeCase, main]]
      : [[foregroundLocks, main], [warningClearsOnActivity, main], [typingKeepsItOpen, main],
         [typingInADialogKeepsItOpen, main], [warningNamesWhatIsLost, main],
         [warningNamesTheRecoveryKey, main], [tickingTotpDoesNotHoldItOpen, main],
         [hiddenTabLocks, throttled]]
    const results = await Promise.all(cases.map(([testCase, browser]) => run(testCase, browser)))

    report(results)
    process.exitCode = results.some((r) => !r.ok) ? 1 : 0
  } finally {
    main.kill()
    throttled?.kill()
  }
}

/** A browser plus the two things the cases need from it: new tabs and a way to stop it. */
async function launchBrowser(port, extraFlags) {
  const process_ = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${port}`, ...extraFlags, 'about:blank',
  ], { stdio: 'ignore' })

  await waitFor(`the browser on ${port} to expose CDP`, async () =>
    fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false))
  log(`browser up on ${port}${extraFlags.length ? '' : ' (throttling left ON)'}`)

  return {
    newTab: async () => {
      const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
      return attach(target.webSocketDebuggerUrl)
    },
    kill: () => process_.kill(),
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
async function assertTabsAreNotThrottled(browser) {
  const [front, back] = await Promise.all([browser.newTab(), browser.newTab()])
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

/**
 * Case 7, added in #303: what the warning SAYS when there is something to lose.
 *
 * The mirror image of case 5, and it needs both halves of that case to be true first.
 * There, keystrokes keep the vault open; here nobody types after the first sentence,
 * so the warning arrives on top of an open dialog with text in it — which is exactly
 * how #303 was found, by hand, while verifying #260.
 *
 * WHAT IT CHECKS IS THE WORDING, and that is not cosmetic. Locking discards the text
 * and that is correct; sixty seconds of warning are only useful to someone who knows
 * they have something to save. It also checks the notice AFTER the lock, which has to
 * still be there when a person comes back — this fires because nobody was at the
 * keyboard, so anything that fades on its own is read by no one.
 */
async function warningNamesWhatIsLost(page) {
  const notes = []
  await register(page, APP_URL, testCredentials('caso7'))

  await openNewEntryDialog(page)
  await typeInDialog(page, 'algo que se perderia')

  /*
   * The clock starts HERE and not at registration: typing is activity, so the last
   * keystroke is what the countdown is measured from.
   */
  const quietSince = Date.now()
  const written = await dialogText(page)
  if (!written.includes('perderia')) {
    throw new Error(`the field holds ${JSON.stringify(written)} instead of the typed text.
    With nothing written there is nothing to lose, and this case would pass proving nothing.`)
  }
  notes.push(`dialog open at ${clock()} holding ${written.length} characters, then untouched`)

  await sleepUntil(quietSince + EXPECT_WARNING_AT + SETTLE, 'the warning, with the dialog untouched')

  if (!(await dialogIsOpen(page))) {
    throw new Error(`the dialog closed on its own ${minutesSince(quietSince)} min in.
    Nothing was at stake by the time the warning arrived, so this case tested nothing.
${await snapshot(page)}`)
  }
  if (!(await hasWarning(page))) {
    throw new Error(`no warning ${minutesSince(quietSince)} min after the last keystroke
${await snapshot(page)}`)
  }

  const warning = (await toastTexts(page)).find((text) => /se bloquear/i.test(text)) ?? ''
  if (!/se perder/i.test(warning)) {
    throw new Error(`the warning does not say anything is about to be lost, with an open dialog holding text.
    It said: ${JSON.stringify(warning)}
    That is #303: whoever reads it and decides to let the vault lock also loses what they wrote.`)
  }
  notes.push(`warning at ${minutesSince(quietSince)} min named the loss: ${JSON.stringify(warning)}`)

  await sleepUntil(quietSince + EXPECT_LOCK_AT + SETTLE, 'the lock itself')

  if (!(await isLocked(page))) {
    throw new Error(`the vault did NOT lock ${minutesSince(quietSince)} min after the last keystroke
${await snapshot(page)}`)
  }

  const discarded = (await toastTexts(page)).find((text) => /descartado/i.test(text)) ?? ''
  if (!discarded) {
    throw new Error(`locked and the dialog is gone, but nothing on screen says the text was discarded.
    Someone coming back to a vanished dialog cannot tell whether they ever wrote it.
${await snapshot(page)}`)
  }
  notes.push(`after locking at ${minutesSince(quietSince)} min, still on screen: ${JSON.stringify(discarded)}`)
  return notes
}
warningNamesWhatIsLost.title = 'caso 7 — el aviso dice lo que se va a perder, y lo sigue diciendo después'

/**
 * Case 8, from #329: the screen where losing it is not losing a draft.
 *
 * WHY THIS ONE IS DIFFERENT FROM CASE 7, and why it is worth nineteen more minutes of
 * clock. There, what a lock throws away is text that can be typed again. Here, by the
 * time the key is on screen `createRecoveryKey` HAS ALREADY registered the wrapper and
 * the hash on the server — the account says it has a recovery key. If the lock takes
 * the screen away, its owner is left with an account claiming a plan B whose only
 * readable copy nobody kept, and they find out on the day they need it.
 *
 * So what is checked is that the two sentences NAME THE KEY. The generic wording about
 * losing what you had typed is true here and useless: whoever reads it has no reason to
 * act, because nothing about it suggests the account is now claiming something false.
 */
async function warningNamesTheRecoveryKey(page) {
  const notes = []
  const credentials = testCredentials('caso8')
  await register(page, APP_URL, credentials)

  await generateRecoveryKey(page, credentials.password)

  /*
   * From here, nothing is touched. Generating is activity, so the countdown runs from
   * the last keystroke of the password just as case 7 measures from the last one typed
   * into the dialog.
   */
  const quietSince = Date.now()
  notes.push(`recovery key on screen at ${clock()}, then untouched`)

  await sleepUntil(quietSince + EXPECT_WARNING_AT + SETTLE, 'the warning, with the key on screen')

  if (!(await recoveryKeyIsOnScreen(page))) {
    throw new Error(`the key left the screen on its own ${minutesSince(quietSince)} min in.
    Nothing was at stake when the warning arrived, so this case tested nothing.
${await snapshot(page)}`)
  }

  const warning = (await toastTexts(page)).find((text) => /se bloquear/i.test(text)) ?? ''
  if (!/clave de recuperaci/i.test(warning)) {
    throw new Error(`the warning does not name the recovery key, with the key on screen.
    It said: ${JSON.stringify(warning)}
    That is #329: it reads like a lost draft, and what is about to be lost is the way back in.`)
  }
  notes.push(`warning at ${minutesSince(quietSince)} min named the key: ${JSON.stringify(warning)}`)

  await sleepUntil(quietSince + EXPECT_LOCK_AT + SETTLE, 'the lock itself')

  if (!(await isLocked(page))) {
    throw new Error(`the vault did NOT lock ${minutesSince(quietSince)} min after generating the key
${await snapshot(page)}`)
  }

  /*
   * And the actionable half. Being told something was lost is only useful with the
   * thing to do next attached, and here it is not obvious: the account is not back to
   * how it was, it is in a state that looks fine and is not.
   */
  const discarded = (await toastTexts(page)).find((text) => /clave de recuperaci/i.test(text)) ?? ''
  if (!discarded) {
    throw new Error(`locked with the key on screen, and nothing says the key is gone.
${await snapshot(page)}`)
  }
  if (!/genera otra/i.test(discarded)) {
    throw new Error(`it says the key is gone but not what to do about it.
    It said: ${JSON.stringify(discarded)}
    Without «genera otra», whoever reads it has no reason to think their account is now lying.`)
  }
  notes.push(`after locking at ${minutesSince(quietSince)} min, still on screen: ${JSON.stringify(discarded)}`)
  return notes
}
warningNamesTheRecoveryKey.title = 'caso 8 — con la clave de recuperación en pantalla, el aviso la nombra y dice qué hacer'

/**
 * Case 1 of #281, the one that was supposed to be impossible.
 *
 * WHY IT IS HERE NOW — measured while closing #260. The earlier conclusion, that
 * headless could not hide a tab, was a generalisation from a true measurement and it
 * was wrong. Opening a NEW tab hides the previous one, and once hidden Chromium
 * throttles it for real:
 *
 *     minute  1:  60 ticks/min      not throttled yet
 *     minute  6:  40 ticks/min      starting
 *     minute 10:   1 tick/min       intensive throttling
 *     minute 16:   1 tick/min       still there
 *
 * That is the scenario the module was designed for and the reason it compares
 * timestamps instead of trusting a timer. With the check interval firing once a
 * minute, the countdown still has to be right when the tab comes back — and if
 * `visibilitychange` is what ends up doing the work, that is the point.
 *
 * This case runs in a browser WITHOUT the anti-throttling flags, because here the
 * throttling is the thing under test rather than an obstacle.
 */
/**
 * Case 9, added in #417: A TICKING TOTP COUNTER IS NOT SOMEBODY BEING THERE.
 *
 * `ADR-017` §2.4 named this as the concrete thing the implementation had to get right,
 * and it is the shape of bug this project keeps writing down: nothing fails, nothing
 * warns, the vault simply never locks. Having an entry with a second factor open is the
 * NORMAL state of somebody using one, so getting it wrong would quietly retire the
 * inactivity lock for exactly the people who most rely on it.
 *
 * THE SUITE CANNOT SETTLE THIS, and that is why the case is here. jsdom throttles
 * nothing and runs no real clock: there is a unit test that locks the vault with the
 * counter on screen, and it would keep passing on a browser where the tab is dropped to
 * one tick a minute. Only a real clock in a real browser closes it.
 *
 * THE RECEIPT IS THE HALF THAT MAKES IT A TEST. A vault that locks while the counter was
 * dead proves nothing at all — it is the same green a broken component would give. So
 * the code is read twice, minutes apart, and the case refuses to pass unless it CHANGED:
 * that is what says the counter was alive the whole time it was being ignored.
 */
async function tickingTotpDoesNotHoldItOpen(page) {
  const notes = []
  await register(page, APP_URL, testCredentials('caso8'))

  await openNewEntryDialog(page)
  await typeInDialog(page, 'con segundo factor')
  await typeTotpSeed(page, TOTP_SEED)

  // From here on nobody touches anything. This is the last activity the vault sees.
  const quietSince = Date.now()
  const first = await totpOnScreen(page)

  if (!/^\d{6}$/.test(first)) {
    throw new Error(`no code on screen after typing the seed, so there was no counter to ignore.
    A green result here would have proved nothing at all. Saw ${JSON.stringify(first)}.
${await snapshot(page)}`)
  }
  notes.push(`code on screen at ${clock()}, so the counter is running`)

  await sleepUntil(quietSince + 2 * MINUTE, 'the counter to cross at least one window')
  const second = await totpOnScreen(page)

  if (second === first) {
    throw new Error(`the code did not change in 2 minutes —${first} both times— so the counter was NOT ticking.
    Whatever this case observed afterwards, it was not a ticking counter being ignored.
${await snapshot(page)}`)
  }
  notes.push(`code changed from ${first} to ${second}, so it ticked for 2 minutes unattended`)

  await sleepUntil(quietSince + EXPECT_WARNING_AT + SETTLE, 'the warning, with the counter still ticking')

  if (!(await hasWarning(page))) {
    throw new Error(`no warning ${minutesSince(quietSince)} min after the last keystroke, with a TOTP code ticking on screen.
    The counter is being treated as activity, so the vault would never lock for anybody
    using a second factor. See ADR-017 §2.4.
${await snapshot(page)}`)
  }
  notes.push(`warning at ${minutesSince(quietSince)} min despite the counter ticking`)

  await sleepUntil(quietSince + EXPECT_LOCK_AT + SETTLE, 'the lock, with the counter still ticking')

  if (!(await isLocked(page))) {
    throw new Error(`still unlocked ${minutesSince(quietSince)} min after the last keystroke, with a TOTP code ticking on screen.
    This is the exact failure ADR-017 §2.4 asked the implementation to avoid.
${await snapshot(page)}`)
  }
  notes.push(`locked at ${minutesSince(quietSince)} min`)

  // And the code went with everything else, which is the other half of that decision.
  const afterwards = await totpOnScreen(page)
  if (afterwards !== '') {
    throw new Error(`the vault locked but a code is still on screen: ${JSON.stringify(afterwards)}.
    ADR-017 §2.4 says it disappears with everything else, without exception.
${await snapshot(page)}`)
  }
  notes.push('the code is gone from the screen after locking')

  return notes
}
tickingTotpDoesNotHoldItOpen.title = 'caso 9 — un contador TOTP corriendo no mantiene la vault abierta'

async function hiddenTabLocks(page, browser) {
  const notes = []
  await register(page, APP_URL, testCredentials('caso1'))
  const opened = Date.now()
  notes.push(`vault opened at ${clock(new Date(opened))}`)

  /*
   * A counter of our own, installed BEFORE hiding, so the case can prove afterwards
   * that the tab really was throttled and not merely reported as hidden. Without it a
   * future Chromium that stopped throttling would leave this passing for the wrong
   * reason — and this whole case exists because that keeps happening.
   */
  await page.evaluate('window.__probe = 0; setInterval(() => window.__probe++, 1000); "ok"')

  // A tab on top is what actually hides it. Page.bringToFront on another tab does not.
  await browser.newTab()
  await sleep(1500)

  const hidden = await page.evaluate('document.visibilityState')
  if (hidden !== 'hidden') {
    throw new Error(`the tab did not go hidden (visibilityState=${hidden}), so nothing below this line
    would have been testing what it claims to test.`)
  }
  notes.push(`tab hidden at ${clock()}`)

  await sleepUntil(opened + EXPECT_LOCK_AT + SETTLE, 'the lock, with the tab hidden')

  const ticks = await page.evaluate('window.__probe')
  const minutes = (Date.now() - opened) / MINUTE
  const perMinute = ticks / minutes

  // Bringing this tab to the front is what un-hides it — measured while diagnosing
  // #305 — and it is also what a person does when they come back to the tab.
  await page.send('Page.bringToFront')
  await sleep(2000)

  if (perMinute > 30) {
    throw new Error(`the tab was hidden but NOT throttled: ${ticks} ticks in ${minutes.toFixed(1)} min
    (${perMinute.toFixed(0)}/min, expected about 1/min once intensive throttling kicks in).
    This case is meant to live through the throttling; without it, it proves no more
    than case 2 already does.`)
  }

  if (!(await isLocked(page))) {
    throw new Error(`the vault was NOT locked after ${minutesSince(opened)} min hidden.
    This is the case the whole feature exists for: a tab in the background is exactly
    when the lock protects something.
    visibilityState now: ${await page.evaluate('document.visibilityState')}
${await snapshot(page)}`)
  }

  notes.push(`locked after ${minutesSince(opened)} min hidden, checked on returning at ${clock()}`)
  notes.push(`throttled for real while hidden: ${ticks} ticks in ${minutes.toFixed(1)} min (${perMinute.toFixed(1)}/min)`)
  return notes
}
hiddenTabLocks.title = 'caso 1 — con la pestaña REALMENTE oculta, al volver está bloqueada'

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
