import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The shipped file itself, as text, so what is exercised is what is deployed. Testing a
// copy of the routing rules would prove the copy right.
import source from '../../public/sw.js?raw'

/*
 * The service worker's routing. See ADR-019 §5 and issue #465.
 *
 * THE PROMISE THIS FILE PROTECTS IS THAT NOTHING UNDER `/api/` IS TOUCHED. An HTTP cache
 * has no idea what signing out means: it would go on answering one account's items after
 * another has unlocked on the same browser, and there is no invalidation to hang that
 * off. It is the same crossing the whole cache design is arranged to prevent, arriving by
 * a different door.
 *
 * AND IT IS INVISIBLE WHEN BROKEN — a worker that cached the API would make the
 * application faster and every screen would look right, until the day two people share a
 * browser.
 *
 * HOW IT RUNS THE REAL FILE: the worker only ever touches `self`, so the source is
 * evaluated with a `self` of this file's making, the handlers it registers are captured,
 * and they are called with events built here. There is no second implementation to keep
 * in step.
 */

interface FakeCache {
  entries: Map<string, unknown>
  match: (request: unknown) => Promise<unknown>
  put: (request: unknown, response: unknown) => Promise<void>
  addAll: (urls: string[]) => Promise<void>
}

interface Harness {
  handlers: Record<string, (event: never) => void>
  cache: FakeCache
  deleted: string[]
  fetched: string[]
  fetchImplementation: (input: unknown) => Promise<unknown>
}

/** The URL a request or a string stands for, which is all the worker's cache keys are. */
function keyOf(request: unknown): string {
  return typeof request === 'string' ? request : (request as { url: string }).url
}

function response(body = 'algo', ok = true) {
  return { ok, status: ok ? 200 : 500, clone: () => response(body, ok), text: async () => body }
}

/** Evaluates the real worker with a `self` this file controls, and captures what it registers. */
function run(): Harness {
  const entries = new Map<string, unknown>()
  const deleted: string[] = []
  const fetched: string[] = []

  const cache: FakeCache = {
    entries,
    match: async (request) => entries.get(keyOf(request)),
    put: async (request, value) => {
      entries.set(keyOf(request), value)
    },
    addAll: async (urls) => {
      for (const url of urls) entries.set(url, response())
    },
  }

  const harness: Harness = {
    handlers: {},
    cache,
    deleted,
    fetched,
    fetchImplementation: async () => response(),
  }

  const self = {
    location: { origin: 'https://evault.test' },
    addEventListener: (name: string, handler: (event: never) => void) => {
      harness.handlers[name] = handler
    },
    caches: {
      open: async () => cache,
      keys: async () => ['evault-shell-v1', 'evault-shell-v0'],
      delete: async (name: string) => {
        deleted.push(name)

        return true
      },
    },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    fetch: async (input: unknown) => {
      fetched.push(keyOf(input))

      return harness.fetchImplementation(input)
    },
  }

  new Function('self', source)(self)

  return harness
}

/** A fetch event, with somewhere to keep whatever the worker decides to answer with. */
function fetchEvent(url: string, { mode = 'no-cors', method = 'GET' } = {}) {
  const event = {
    request: { url, mode, method },
    responded: false as boolean,
    answer: undefined as unknown,
    respondWith(value: unknown) {
      this.responded = true
      this.answer = value
    },
  }

  return event
}

let harness: Harness

beforeEach(() => {
  harness = run()
})

describe('the API', () => {
  /*
   * Returning without calling `respondWith` hands the request back to the browser as if
   * this worker did not exist. That is what «left alone» has to mean: not fetched by the
   * worker, not read, not stored.
   */
  it.each([
    '/api/vaults',
    '/api/vaults/vault-1/items',
    '/api/auth/login',
    '/api/health',
  ])('is left alone: %s', (path) => {
    const event = fetchEvent(`https://evault.test${path}`)

    harness.handlers.fetch(event as never)

    expect(event.responded).toBe(false)
  })

  it('never ends up in the cache', async () => {
    const event = fetchEvent('https://evault.test/api/vaults/vault-1/items')

    harness.handlers.fetch(event as never)
    await Promise.resolve()

    expect([...harness.cache.entries.keys()]).not.toContain(
      'https://evault.test/api/vaults/vault-1/items',
    )
    expect(harness.fetched).toHaveLength(0)
  })
})

describe('the shell', () => {
  it('answers a hashed asset from the cache without asking the network', async () => {
    const asset = 'https://evault.test/assets/index-abc123.js'

    harness.cache.entries.set(asset, response('el bundle'))

    const event = fetchEvent(asset)
    harness.handlers.fetch(event as never)

    expect(event.responded).toBe(true)
    await event.answer
    expect(harness.fetched).toHaveLength(0)
  })

  it('fetches and keeps an asset it does not have yet', async () => {
    const asset = 'https://evault.test/assets/Audit-xyz.js'
    const event = fetchEvent(asset)

    harness.handlers.fetch(event as never)
    await event.answer

    expect(harness.fetched).toContain(asset)
    expect([...harness.cache.entries.keys()]).toContain(asset)
  })

  /*
   * A response that did not arrive is not a page. Storing it would serve a failure from
   * the cache afterwards, which is worse than the failure itself: it would persist.
   */
  it('does not keep a response that failed', async () => {
    harness.fetchImplementation = async () => response('error', false)

    const asset = 'https://evault.test/assets/roto.js'
    const event = fetchEvent(asset)

    harness.handlers.fetch(event as never)
    await event.answer

    expect([...harness.cache.entries.keys()]).not.toContain(asset)
  })
})

describe('navigating', () => {
  /*
   * The network first, and this is the one thing that must NOT come from the cache while
   * there is a network: a stale shell is how somebody runs a version replaced weeks ago
   * with nothing to show for it.
   */
  it('asks the network even when there is a copy', async () => {
    /*
     * Kept under the full URL and not under `/`, which is what a cache-first lookup
     * would actually match. A first version stored it as `/`, so a cache-first mutation
     * missed anyway and went to the network — the test passed for the wrong reason and
     * protected nothing.
     */
    harness.cache.entries.set('https://evault.test/', response('la vieja'))

    const event = fetchEvent('https://evault.test/', { mode: 'navigate' })

    harness.handlers.fetch(event as never)
    await event.answer

    expect(harness.fetched).toContain('https://evault.test/')
  })

  it('falls back to the cached shell when nothing answers', async () => {
    harness.cache.entries.set('/', response('la guardada'))
    harness.fetchImplementation = async () => {
      throw new Error('sin red')
    }

    const event = fetchEvent('https://evault.test/', { mode: 'navigate' })

    harness.handlers.fetch(event as never)

    expect(await (event.answer as Promise<{ text: () => Promise<string> }>).then((r) => r.text())).toBe(
      'la guardada',
    )
  })

  /*
   * Any route, not only `/`. The SPA answers `/audit` from the same shell, so reloading
   * on a section with no network has to work like reloading on the home page.
   */
  it('falls back for a route that is not the root', async () => {
    harness.cache.entries.set('/', response('la guardada'))
    harness.fetchImplementation = async () => {
      throw new Error('sin red')
    }

    const event = fetchEvent('https://evault.test/audit', { mode: 'navigate' })

    harness.handlers.fetch(event as never)

    await expect(event.answer as Promise<unknown>).resolves.toBeDefined()
  })
})

describe('what it refuses to handle', () => {
  it('leaves another origin alone', () => {
    const event = fetchEvent('https://otro-sitio.test/assets/algo.js')

    harness.handlers.fetch(event as never)

    expect(event.responded).toBe(false)
  })

  it('leaves a write alone', () => {
    const event = fetchEvent('https://evault.test/algo', { method: 'POST' })

    harness.handlers.fetch(event as never)

    expect(event.responded).toBe(false)
  })
})

describe('a new version arriving', () => {
  /*
   * The acceptance criterion of #465: it displaces the old one without anybody clearing
   * anything. `skipWaiting` and `clients.claim` are what make that true, and deleting the
   * other caches is what stops an old shell being served from a name nobody reads.
   */
  it('takes over and removes the caches of other versions', async () => {
    const waited: Promise<unknown>[] = []

    harness.handlers.activate({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) } as never)
    await Promise.all(waited)

    expect(harness.deleted).toEqual(['evault-shell-v0'])
  })

  it('keeps its own cache', async () => {
    const waited: Promise<unknown>[] = []

    harness.handlers.activate({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) } as never)
    await Promise.all(waited)

    expect(harness.deleted).not.toContain('evault-shell-v1')
  })
})

describe('installing', () => {
  /*
   * The asset names carry a content hash, so nothing can list them in advance: they are
   * read out of the HTML. If that ever finds nothing the worker still installs, and
   * offline start works from the second visit instead of the first — a benign failure was
   * the condition for parsing at all.
   */
  it('caches the shell and everything the build produced', async () => {
    harness.fetchImplementation = async (input) =>
      keyOf(input) === '/.vite/manifest.json'
        ? {
            ...response(),
            json: async () => ({
              'index.html': { file: 'assets/index-abc.js', css: ['assets/index-def.css'] },
              '_Login.js': { file: 'assets/Login-ghi.js' },
            }),
          }
        : response()

    const waited: Promise<unknown>[] = []

    harness.handlers.install({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) } as never)
    await Promise.all(waited)

    const cached = [...harness.cache.entries.keys()]

    expect(cached).toContain('/')
    expect(cached).toContain('/manifest.webmanifest')
    expect(cached).toContain('/assets/index-abc.js')
    expect(cached).toContain('/assets/index-def.css')
    /*
     * THE ONE THAT COST A MEASUREMENT: a lazily loaded route chunk. The HTML never names
     * it, so the first version of this worker left it out — and with the server off, a
     * first visit rendered nothing at all.
     */
    expect(cached).toContain('/assets/Login-ghi.js')
  })

  /*
   * `addAll` rejects the whole batch if one URL fails, which would throw away a cache
   * that was almost complete. Half a cache still answers.
   */
  it('keeps what it could fetch when one asset fails', async () => {
    harness.fetchImplementation = async (input) => {
      const url = keyOf(input)

      if (url === '/.vite/manifest.json') {
        return {
          ...response(),
          json: async () => ({ a: { file: 'assets/bueno.js' }, b: { file: 'assets/roto.js' } }),
        }
      }

      if (url === '/assets/roto.js') throw new Error('no llega')

      return response()
    }

    const waited: Promise<unknown>[] = []

    harness.handlers.install({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) } as never)
    await Promise.all(waited)

    const cached = [...harness.cache.entries.keys()]

    expect(cached).toContain('/assets/bueno.js')
    expect(cached).not.toContain('/assets/roto.js')
    expect(cached).toContain('/')
  })

  it('still installs, and still caches the shell, when the manifest is missing', async () => {
    harness.fetchImplementation = async (input) => {
      if (keyOf(input) === '/.vite/manifest.json') throw new Error('no está')

      return response()
    }

    const waited: Promise<unknown>[] = []

    harness.handlers.install({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) } as never)

    await expect(Promise.all(waited)).resolves.toBeDefined()
    expect([...harness.cache.entries.keys()]).toContain('/')
  })

  /*
   * The whole network down at install time. It must not leave the worker refusing to
   * install: the assets are then cached as they are requested, which still gets there.
   */
  it('installs even when nothing answers at all', async () => {
    harness.fetchImplementation = async () => {
      throw new Error('sin red')
    }

    const waited: Promise<unknown>[] = []

    harness.handlers.install({ waitUntil: (promise: Promise<unknown>) => waited.push(promise) } as never)

    await expect(Promise.all(waited)).resolves.toBeDefined()
  })
})

/*
 * Registering it, which is the other half and the one that fails by doing nothing.
 *
 * Each guard here refuses for a different reason, and a wrong one would leave the
 * application working perfectly while the worker never installed — so the only symptom
 * would be that offline never worked, discovered with no network to investigate it.
 */
describe('registering the worker', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

  function withServiceWorker(register: () => Promise<unknown>) {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })

    /*
     * jsdom is not a secure context, and the real guard is not decoration: without
     * HTTPS a browser refuses the registration outright. See ADR-012 on why that is a
     * condition of the application working rather than a hardening step.
     */
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  }

  afterEach(() => {
    vi.unstubAllEnvs()

    if (original) Object.defineProperty(navigator, 'serviceWorker', original)
    else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker')
  })

  it('registers /sw.js in the production build', async () => {
    vi.stubEnv('PROD', true)

    const register = vi.fn().mockResolvedValue({})
    withServiceWorker(register)

    const { registerServiceWorker } = await import('@/lib/serviceWorker')
    registerServiceWorker()

    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  /*
   * In development Vite rewrites modules on every change, and a worker caching them
   * turns hot reload into a source of stale files that look like bugs in the code being
   * written.
   */
  it('does nothing in development', async () => {
    vi.stubEnv('PROD', false)

    const register = vi.fn().mockResolvedValue({})
    withServiceWorker(register)

    const { registerServiceWorker } = await import('@/lib/serviceWorker')
    registerServiceWorker()

    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing outside a secure context', async () => {
    vi.stubEnv('PROD', true)

    const register = vi.fn().mockResolvedValue({})
    withServiceWorker(register)
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })

    const { registerServiceWorker } = await import('@/lib/serviceWorker')
    registerServiceWorker()

    expect(register).not.toHaveBeenCalled()
  })

  it('does not fail on a browser without service workers', async () => {
    vi.stubEnv('PROD', true)
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker')

    const { registerServiceWorker } = await import('@/lib/serviceWorker')

    expect(() => registerServiceWorker()).not.toThrow()
  })

  /*
   * The offline cache is a convenience and the vault is not: a registration that cannot
   * happen must leave an application that starts exactly as it did before.
   */
  it('swallows a registration that fails', async () => {
    vi.stubEnv('PROD', true)
    withServiceWorker(() => Promise.reject(new Error('no se pudo')))

    const { registerServiceWorker } = await import('@/lib/serviceWorker')

    expect(() => registerServiceWorker()).not.toThrow()
  })
})
