/**
 * Filling a vault with hundreds of entries and measuring what that costs. See #348.
 *
 * WHY THE SEEDING DOES NOT GO THROUGH THE IMPORT DIALOG, which would be the obvious
 * way in: the import is one of the things being measured, and an instrument cannot be
 * the thing under test. It is also the slowest path there is right now — 4 min 19 s
 * for 370 entries — so every run would pay it twice.
 *
 * WHAT IT DOES INSTEAD is reach for the app's own modules through the dev server:
 * `import('/src/lib/vault/api.ts')` gets the real `createItem`, with the real
 * encryption and the real vault key sitting in memory. Nothing about the cryptography
 * is reimplemented here, which is the only acceptable shortcut — a seeding script that
 * encrypted entries its own way would eventually encrypt them differently from the
 * app and nobody would notice until the numbers stopped meaning anything.
 *
 * THE PRICE OF THAT SHORTCUT, and it is worth stating plainly: this file needs the
 * Vite dev server, because it imports TypeScript by path. It cannot be pointed at a
 * built `dist/`. That is fine for what it is — a command run by hand while working on
 * the list — and it is the same requirement `verify-auto-lock.mjs` already has.
 */

import { sleep, waitFor } from './cdp.mjs'

/**
 * Entry names carry a word half of them share, so that searching filters roughly half
 * the vault at any size. Comparing a search that matches 5 % against one that matches
 * 90 % would measure the filter, not the list.
 */
const seedScript = (count, offset, concurrency) => `(async () => {
  const api = await import('/src/lib/vault/api.ts')
  const vaults = await api.listVaults()
  const vault = vaults.find((v) => v.is_personal) ?? vaults[0]
  if (!vault) throw new Error('no vault to seed')

  const entry = (i) => ({
    nombre: \`Servicio \${String(i).padStart(4, '0')} \${i % 2 ? 'alfa' : 'beta'}\`,
    usuario: \`persona\${i}@example.test\`,
    password: \`clave-generada-\${i}-Xk9vQ2pLm4Zt7wRb\`,
    url: \`https://servicio\${i}.example.test/login\`,
    notas: i % 3 === 0 ? 'Entrada sembrada por el banco de pruebas de #348.' : '',
  })

  const queue = Array.from({ length: ${count} }, (_, i) => i + ${offset})
  const started = performance.now()
  const workers = Array.from({ length: ${concurrency} }, async () => {
    for (;;) {
      const i = queue.shift()
      if (i === undefined) return
      await api.createItem(vault.id, entry(i))
    }
  })
  await Promise.all(workers)

  return { seeded: ${count}, ms: Math.round(performance.now() - started), vaultId: vault.id }
})()`

/**
 * Writes `count` entries straight through the app's API module.
 *
 * The concurrency is modest on purpose. It is not there to be fast — it is there so
 * that seeding 370 entries against a single-process `artisan serve` does not dominate
 * the run. Pushing it higher stops helping, because that server answers one request at
 * a time, and starts looking like the traffic a rate limiter exists to stop.
 */
export async function seed(page, { count, offset = 0, concurrency = 6 }) {
  return page.evaluate(seedScript(count, offset, concurrency))
}

/**
 * Counts requests to the items endpoint from inside the page.
 *
 * A PerformanceObserver and not `performance.getEntriesByType('resource')`, because
 * that buffer holds 250 entries by default and today's import fires 741 — the count
 * would silently stop growing and report a healthy number. A reassuring zero with a
 * different shape, which is the failure this repository has a name for.
 */
export const startCountingRequests = (page) => page.evaluate(`(() => {
  window.__itemRequests = 0
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.name.includes('/items')) window.__itemRequests++
    }
  }).observe({ type: 'resource', buffered: true })
  return true
})()`)

export const resetRequestCount = (page) => page.evaluate('window.__itemRequests = 0; true')
export const requestCount = (page) => page.evaluate('window.__itemRequests ?? 0')

/**
 * Waits until the page stops changing, and reports WHEN it stopped.
 *
 * WHY THIS IS NOT «the first row appeared, plus two animation frames», which is what
 * this file did first and what the numbers caught: React 19 renders concurrently, so
 * the list arrives in pieces. Measured while writing this — 922 ms in, a ten-entry
 * vault had 3 rows and 63 nodes; three seconds in it had 10 rows and 279. Timing the
 * first row would have reported a fraction of the wait, and — worse — every layout
 * measurement taken right after would have read a half-built DOM.
 *
 * WHY IT IS NOT «all N rows are there» either: a virtualised list never puts N rows in
 * the DOM, so that definition would hang on the fixed version and pass only on the
 * broken one. A check that inverts when the bug is fixed is worse than no check.
 *
 * So the definition is the one a person would use: the screen stopped moving. What is
 * returned is the instant of the LAST change, not the instant quiet was confirmed —
 * the settling window is measurement overhead and does not belong in the number.
 */
const settleScript = (startedExpression) => `(async () => {
  const started = ${startedExpression}
  const QUIET_MS = 300
  let nodes = -1
  let lastChange = performance.now()
  let firstRowAt = null
  const deadline = started + 120000

  for (;;) {
    const now = document.getElementsByTagName('*').length
    if (now !== nodes) {
      nodes = now
      lastChange = performance.now()
    }
    if (firstRowAt === null && document.querySelector('main li')) {
      firstRowAt = performance.now()
    }
    if (firstRowAt !== null && performance.now() - lastChange > QUIET_MS) {
      return {
        totalMs: Math.round(lastChange - started),
        paintMs: Math.round(lastChange - firstRowAt),
      }
    }
    if (performance.now() > deadline) throw new Error('the list never settled')
    await new Promise((r) => setTimeout(r, 20))
  }
})()`

/**
 * Unlocks a reloaded vault and times two different things.
 *
 * `totalMs` is what the person waits through: unlock, request, decrypt, paint. It is
 * the honest number and it is what gets reported.
 *
 * `paintMs` is from the first row appearing to the page going still, and it exists
 * because the total CANNOT decide anything. Deriving the key is 600.000 PBKDF2
 * iterations — about 950 ms on the machine this was written on — and that swamps
 * everything else: measured at 10 entries the total was 958 ms, and at 120 it was
 * 1.028. A ratio of 1.1, comfortably inside any limit, on a list whose DOM had grown
 * nine times over. A limit that cannot fail is worse than no limit, because it reports
 * green about something it never looked at.
 *
 * Subtracting the unlock leaves the part this iteration is actually about.
 */
export async function measureUnlockAndPaint(page, password) {
  await waitFor('the unlock screen', async () => page.evaluate('Boolean(document.querySelector("#password"))'))

  return page.evaluate(`(async () => {
    const input = document.querySelector('#password')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(password)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))

    window.__startedAt = performance.now()
    document.querySelector('form').requestSubmit()
    return await ${settleScript('window.__startedAt')}
  })()`)
}

/**
 * How long the first keystroke in the search box takes to show its result.
 *
 * The FIRST one and not an average: it is the expensive one, because it is the one
 * that tears down most of the list. Measured to two animation frames, which is when
 * the result is actually on screen rather than merely computed.
 */
export async function measureSearch(page) {
  return page.evaluate(`(async () => {
    const input = document.querySelector('input[type=search]')
    if (!input) throw new Error('no search box on screen')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

    // Settled and not two animation frames, for the same reason as the paint: the list
    // rebuilds concurrently, so a fixed number of frames times a fraction of the work.
    const type = async (text) => {
      window.__startedAt = performance.now()
      setter.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return await ${settleScript('window.__startedAt')}
    }

    const filtering = await type('alfa')
    await new Promise((r) => setTimeout(r, 200))
    const clearing = await type('')

    // The worse of the two. Clearing is usually the expensive one, because it puts the
    // whole vault back on screen — 1.293 ms against 773 in the measurements of #348.
    return Math.max(filtering.totalMs, clearing.totalMs)
  })()`)
}

/**
 * The shape of the page: where the user menu ended up, how tall the document is, and
 * how many nodes it takes.
 *
 * The user menu is located by its own aria-haspopup inside the sidebar, not by
 * position, so that the measurement keeps meaning the same thing if the sidebar is
 * rebuilt. `insideWindow` is the whole of #350 in one boolean.
 */
export const measureLayout = (page) => page.evaluate(`(() => {
  const aside = document.querySelector('aside')
  const menu = aside?.querySelector('button[aria-haspopup="menu"]')
  const box = menu?.getBoundingClientRect()

  return {
    domNodes: document.getElementsByTagName('*').length,
    documentHeight: document.documentElement.scrollHeight,
    rows: document.querySelectorAll('main li').length,
    userMenu: {
      found: Boolean(menu),
      top: box ? box.top + window.scrollY : Number.POSITIVE_INFINITY,
      windowHeight: window.innerHeight,
      insideWindow: Boolean(box) && box.top + window.scrollY < window.innerHeight,
    },
  }
})()`)

/**
 * Imports a CSV through the dialog a person would use, and counts what it costs.
 *
 * The file is built in the page and handed to the input through a DataTransfer rather
 * than uploaded from disk. It keeps the run self-contained, and — measured the hard
 * way while writing this — a file the browser cannot actually read is attached with
 * zero bytes and no error, which looks exactly like an importer that rejects the file.
 */
export async function measureImport(page, csv) {
  const openDialog = `Array.from(document.querySelectorAll('button')).find(b => /^importar$/i.test((b.textContent ?? '').trim()))`
  await waitFor('the Importar button', async () => page.evaluate(`Boolean(${openDialog})`))
  await page.evaluate(`(() => { ${openDialog}.click(); return true })()`)
  await waitFor('the import dialog', async () => page.evaluate(`Boolean(document.querySelector('[role=dialog] input[type=file]'))`))

  await page.evaluate(`(() => {
    const input = document.querySelector('[role=dialog] input[type=file]')
    const data = new DataTransfer()
    data.items.add(new File([${JSON.stringify(csv)}], 'banco-de-pruebas.csv', { type: 'text/csv' }))
    input.files = data.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)

  const previewed = await waitFor('the import preview', async () =>
    page.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('[role=dialog] button')).find(b => /^importar \\d+$/i.test((b.textContent ?? '').trim()))
      return button ? Number((button.textContent ?? '').match(/\\d+/)[0]) : 0
    })()`))

  await resetRequestCount(page)

  const ms = await page.evaluate(`(async () => {
    const button = Array.from(document.querySelectorAll('[role=dialog] button')).find(b => /^importar \\d+$/i.test((b.textContent ?? '').trim()))
    const started = performance.now()
    button.click()

    const deadline = started + 900000
    for (;;) {
      const dialog = document.querySelector('[role=dialog]')
      if (dialog && /entradas importadas|entrada importada|ha fallado/i.test(dialog.innerText)) break
      if (performance.now() > deadline) throw new Error('the import never finished')
      await new Promise((r) => setTimeout(r, 200))
    }
    return Math.round(performance.now() - started)
  })()`)

  const outcome = await page.evaluate(`document.querySelector('[role=dialog]')?.innerText ?? ''`)
  if (/ha fallado/i.test(outcome)) {
    throw new Error(`the import reported a failure: ${outcome.replace(/\s+/g, ' ').slice(0, 200)}`)
  }

  const requests = await requestCount(page)
  await page.evaluate(`(() => {
    const done = Array.from(document.querySelectorAll('[role=dialog] button')).find(b => /terminar/i.test(b.textContent ?? ''))
    done?.click()
    return true
  })()`)

  return { previewed, requests, ms }
}

/** Deletes the first entry through its own buttons, and counts what that costs. */
export async function measureDelete(page) {
  await waitFor('a delete button', async () =>
    page.evaluate(`Boolean(document.querySelector('main button[aria-label^="Borrar "]'))`))

  const before = await page.evaluate(`document.querySelectorAll('main li').length`)
  await resetRequestCount(page)

  await page.evaluate(`(() => { document.querySelector('main button[aria-label^="Borrar "]').click(); return true })()`)
  await waitFor('the delete confirmation', async () =>
    page.evaluate(`Boolean(Array.from(document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')).find(b => /borrar/i.test(b.textContent ?? '')))`))

  const ms = await page.evaluate(`(async () => {
    const confirm = Array.from(document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')).find(b => /borrar/i.test(b.textContent ?? ''))
    const started = performance.now()
    confirm.click()

    const deadline = started + 60000
    for (;;) {
      if (document.querySelectorAll('main li').length < ${before} && !document.querySelector('[role=dialog]')) break
      if (performance.now() > deadline) throw new Error('the entry was never removed from the list')
      await new Promise((r) => setTimeout(r, 10))
    }
    return Math.round(performance.now() - started)
  })()`)

  /*
   * A beat before reading the counter. The request that matters may be fired by the
   * invalidation right after the list updates, and counting too early would credit the
   * fix with a request that is still on its way — reporting the defect as absent
   * because the measurement was impatient.
   */
  await sleep(1500)

  return { requests: await requestCount(page), ms }
}

/** A Chrome-format CSV, which is one of the three the importer already reads. */
export function chromeCsv(entries) {
  const rows = ['name,url,username,password,note']
  for (let i = 0; i < entries; i += 1) {
    rows.push(
      `"Importada ${String(i).padStart(4, '0')}","https://importada${i}.example.test/login",` +
      `"persona${i}@example.test","clave-importada-${i}-Zt7wRbXk9vQ2","nota ${i}"`,
    )
  }
  return rows.join('\n') + '\n'
}
