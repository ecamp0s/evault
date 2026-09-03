/**
 * The service worker that makes the application start with no network. See ADR-019.
 *
 * IT CACHES THE SHELL AND NOT THE API, and that is the lineamiento of ADR-019 §5 rather
 * than a preference. An HTTP cache does not know what to do when somebody signs out: it
 * would keep answering one account's `/api/vaults/…/items` after another has unlocked,
 * and there is no invalidation to hang off. The vault's data goes to IndexedDB
 * explicitly, through `deviceCache.ts`, where clearing it is a decision somebody wrote.
 *
 * So every request under `/api/` is left completely alone here: not fetched, not
 * inspected, not stored. The `fetch` handler returns without calling `respondWith`,
 * which hands the request back to the browser as if this worker did not exist.
 *
 * EVERYTHING GOES THROUGH `self.`, INCLUDING `caches` AND `fetch`, and that is on
 * purpose: it lets the tests run this exact file with a `self` of their own instead of
 * testing a copy of the logic. What ships is what is checked.
 *
 * WHY IT IS HAND-WRITTEN. A generator would bring a build plugin into the client that
 * serves the JavaScript that encrypts the passwords, and ADR-001 asks that such
 * additions be worth their weight. What is needed here is a shell cache and an update
 * rule, which is this file.
 */

/**
 * The cache name carries a version, and `activate` deletes every other one.
 *
 * THE TRADE-OFF, SAID OUT LOUD: with `skipWaiting` and `clients.claim` a new version
 * takes over immediately and nobody has to clear anything, which is what #465 asks for.
 * The cost is a tab left open across a deploy: it keeps running the old page, and a
 * route it lazy-loads for the first time afterwards may ask for a chunk that no longer
 * exists on the server and is no longer in the cache either.
 *
 * That hazard is not this worker's doing — it is the ordinary «chunk load error after a
 * deploy» that any hashed build has — and the alternative is worse for an application
 * that holds passwords: a worker that waits leaves somebody on an old client without
 * telling them, indefinitely.
 */
const CACHE = 'evault-shell-v1'

/**
 * The shell: what has to be there for the application to start with no network.
 *
 * The icons are listed by hand because they live in `public/` and Vite's manifest only
 * knows what it processed. Leaving them out was measured, not imagined: with the server
 * off the browser reported «Error while trying to use the following icon from the
 * Manifest» for every one of them.
 */
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

/**
 * Everything the build produced, from the manifest Vite writes.
 *
 * WHY THE MANIFEST AND NOT THE HTML, WHICH WAS THE FIRST ATTEMPT AND WAS MEASURABLY
 * WRONG: the entry HTML names the entry chunks and nothing else, so the route chunks —
 * loaded lazily — were never precached. On a first visit the worker installs and claims
 * AFTER the page has already fetched its own resources, so those chunks never passed
 * through it either.
 *
 * The consequence was seen and not guessed: with the server off, a first visit rendered
 * no application at all and showed the «there is a new version» banner, because `Login`'s
 * chunk was nowhere. From the second visit it worked. `build.manifest` in
 * `vite.config.ts` is what closes that, and it exists for this and nothing else.
 *
 * IF IT CANNOT BE READ, NOTHING BREAKS: the assets are then cached as they are requested,
 * which is the second-visit behaviour this replaced. A benign failure is what allows
 * reading it at install time at all.
 */
async function builtAssets() {
  try {
    const response = await self.fetch('/.vite/manifest.json', { cache: 'reload' })

    if (!response.ok) return []

    const manifest = await response.json()

    return Object.values(manifest).flatMap((entry) => [
      ...(entry.file ? [`/${entry.file}`] : []),
      ...(entry.css ?? []).map((file) => `/${file}`),
      ...(entry.assets ?? []).map((file) => `/${file}`),
    ])
  } catch {
    return []
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await self.caches.open(CACHE)

      /*
       * One at a time and not with `addAll`, which rejects the whole batch if a single
       * URL fails. Half a cache is worth more than none: whatever did arrive still
       * answers, and what did not is fetched when it is asked for.
       */
      const urls = [...SHELL, ...(await builtAssets())]

      await Promise.all(
        urls.map(async (url) => {
          try {
            const response = await self.fetch(url, { cache: 'reload' })

            if (response.ok) await cache.put(url, response)
          } catch {
            // Cached later, when something asks for it.
          }
        }),
      )

      // The new worker takes over instead of waiting for every tab to close. See the
      // note on CACHE for what that costs and why it is still the better half.
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await self.caches.keys()

      await Promise.all(names.filter((name) => name !== CACHE).map((name) => self.caches.delete(name)))

      await self.clients.claim()
    })(),
  )
})

/** Straight from the cache, and only asking the network when there is nothing there. */
async function fromCacheFirst(request) {
  const cache = await self.caches.open(CACHE)
  const cached = await cache.match(request)

  if (cached) return cached

  const response = await self.fetch(request)

  // Only what actually arrived, and only from our own origin: an opaque response has a
  // status of 0 and caching it would store a failure as if it were a page.
  if (response.ok) await cache.put(request, response.clone())

  return response
}

/**
 * The network first, and the cached shell when it does not answer.
 *
 * Navigations are the one thing that must NOT come from the cache while there is a
 * network: a stale shell is how somebody ends up running a version of the application
 * that was replaced weeks ago without any sign of it.
 */
async function fromNetworkFirst(request) {
  const cache = await self.caches.open(CACHE)

  try {
    const response = await self.fetch(request)

    if (response.ok) await cache.put('/', response.clone())

    return response
  } catch (error) {
    const cached = await cache.match('/')

    if (cached) return cached

    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  /*
   * THE API IS LEFT ALONE, and this is the first check on purpose: returning without
   * calling `respondWith` hands the request straight back to the browser, so nothing
   * here fetches it, reads it or stores it.
   */
  if (url.pathname.startsWith('/api/')) return

  // Somebody else's origin is not ours to cache, and a write is not cacheable at all.
  if (url.origin !== self.location.origin || request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(fromNetworkFirst(request))

    return
  }

  /*
   * The rest is the shell: hashed assets, the manifest, the icons. Cache first because
   * a content hash in the name is a promise that the bytes never change — a different
   * build produces a different name.
   */
  event.respondWith(fromCacheFirst(request))
})
