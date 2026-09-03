/**
 * Registers the service worker that lets the application start with no network.
 *
 * ONLY IN THE PRODUCTION BUILD. In development Vite serves modules it rewrites on every
 * change, and a worker caching them turns hot reload into a source of stale files that
 * look like bugs in the code being written. `import.meta.env.PROD` is replaced at compile
 * time, so in a development bundle this whole function is dead code.
 *
 * IT NEVER BREAKS THE START-UP. A browser without service workers, a page served over
 * plain HTTP, storage blocked outright: all of them have to leave an application that
 * works exactly as it did before, because this is the offline convenience and not the
 * vault. That is why the failure is swallowed and not reported — there is nothing the
 * person reading the screen could do with it.
 *
 * IT IS CALLED AFTER THE FIRST PAINT, from `main.tsx`, so registering never competes for
 * the network with the modules the application needs to show anything at all.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  /*
   * A secure context is required by the spec, and `.localhost` counts as one — which is
   * what lets this be exercised on the development machine at all. See ADR-012 on why
   * HTTPS is a condition of the application starting rather than a hardening step.
   */
  if (!window.isSecureContext) return

  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // Nothing to say and nobody to say it to: the application works without this.
  })
}
