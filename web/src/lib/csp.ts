/**
 * The SPA's Content-Security-Policy.
 *
 * It lives here, in the client, and not in Caddy's configuration, following what
 * ADR-005 asks: the same build has to serve a hosted deployment and a self-hosted one
 * without the operator having to reproduce a proxy configuration they do not know. It
 * is injected as a `<meta http-equiv>` into the HTML at build time. See vite.config.ts.
 *
 * Why it matters here more than in other applications: since Iteration 3 this origin
 * holds in memory the key that decrypts the user's vault. A script running here does
 * not steal a session, it steals the passwords. ADR-007 says it expressly: the token no
 * longer being persisted reduces the loot of an XSS, not the probability of one. This
 * attacks the probability.
 *
 * A known limitation of serving it through a meta tag, and a real one: `frame-ancestors`,
 * `report-uri` and `report-to` **are ignored** in a meta, so protection against
 * clickjacking and the reporting of violations take a real header. Whoever deploys
 * behind a proxy can add it there without touching the build, and the API does carry
 * them because Laravel serves them; see app/Http/Middleware/SecurityHeaders.php.
 *
 * There is no `Report-Only` mode either: that header is ignored in a meta just like the
 * ones above. That is why verifying it breaks nothing was done by walking the whole
 * application in the browser, with the production build and not only the development
 * one, which is more permissive.
 */

/** The sources Vite needs in development and that must never travel to production. */
const DEV_ONLY = {
  /*
   * Vite injects the HMR client as an inline script and React Refresh uses eval.
   * Without this `npm run dev` does not start, which is exactly what the issue asks not
   * to break. Neither of the two appears in the production build.
   */
  script: ["'unsafe-inline'", "'unsafe-eval'"],
  /* The WebSocket Vite announces changes over. */
  connect: ['ws:', 'wss:'],
}

/** Extracts the origin from a URL, which is what a CSP directive understands. */
export interface CspOptions {
  dev: boolean
}

/**
 * Builds the policy. It is still a function and not a constant because the sources the
 * development server needs must not leak into production.
 *
 * It no longer takes the API's URL: since ADR-016 it shares an origin with the SPA, so
 * `'self'` covers it.
 */
export function securityPolicy({ dev }: CspOptions): string {
  const directives: Record<string, string[]> = {
    /* Everything without a directive of its own falls here, and here only our own is allowed. */
    'default-src': ["'self'"],

    'script-src': ["'self'", ...(dev ? DEV_ONLY.script : [])],

    /*
     * 'unsafe-inline' on styles, and it is not an oversight that could be removed
     * today: Base UI — underneath shadcn with the base-nova preset — computes the
     * position of dialogs and menus and writes it as a style attribute. Without this,
     * any floating layer appears in the top-left corner.
     *
     * The risk accepted is bounded: with 'unsafe-inline' on styles, information can be
     * exfiltrated with CSS selectors, but injecting the style is required first, and
     * that already takes the XSS script-src prevents.
     */
    'style-src': ["'self'", "'unsafe-inline'"],

    /* data: for the icons and for any embedded SVG. */
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],

    /*
     * The directive that does the most work in this product: it limits where a script
     * that got to run could send data.
     *
     * `'self'` is enough since ADR-016, because the API shares an origin with the SPA.
     * Before, its origin had to be named separately, and composing it wrong blocked the
     * requests by a different route from CORS, with the same symptom.
     */
    'connect-src': ["'self'", ...(dev ? DEV_ONLY.connect : [])],

    /* None of this is used, so it is closed instead of letting it inherit default-src. */
    'object-src': ["'none'"],
    'frame-src': ["'none'"],

    /*
     * The service worker, which is what makes the vault readable without a network.
     * See ADR-019 and issue #463.
     *
     * IT USED TO BE `'none'`, AND THAT WAS CORRECT WHEN IT WAS WRITTEN — the comment
     * above still applies to the two directives it now covers. Nothing here used a
     * worker, so closing it cost nothing. Iteration 14 is what changed the fact, not
     * the reasoning.
     *
     * `'self'` and NOT a wildcard, and the distinction is the whole point: the worker
     * this admits is our own bundle, served from the same origin as everything else.
     * A script that got to run still cannot register a worker it fetched from
     * somewhere else, which in an application holding the key to a vault is the case
     * worth closing.
     */
    'worker-src': ["'self'"],

    'manifest-src': ["'self'"],

    /* It stops an injected <base> from redirecting every relative route. */
    'base-uri': ["'none'"],

    /*
     * No form in the application navigates: they are all handled in JavaScript and sent
     * through axios. Closing it blocks the simplest way to exfiltrate whatever the user
     * types, which in a password manager is their master password.
     */
    'form-action': ["'none'"],
  }

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}
