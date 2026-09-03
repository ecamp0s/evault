// defineConfig comes from vitest/config and not from vite: it extends Vite's with the
// `test` key, and that way the application's configuration and the tests' are the same
// one. Importing it from 'vite' would compile, but `test` would be left untyped.
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
// With the extension, which is what Vite's native config loader asks for. Without it
// there is a warning on every start-up, and `allowImportingTsExtensions` in
// tsconfig.node.json allows writing it without the type check complaining.
import { securityPolicy } from './src/lib/csp.ts'

// import.meta.dirname and not __dirname: Vite's native config loader does not support
// __dirname and warns that it will become the default mode.
const projectRoot = import.meta.dirname

/**
 * Injects the Content-Security-Policy into the HTML as a meta.
 *
 * It goes in the build and not in Caddy's configuration because the same artefact has to
 * serve any self-hosted deployment, per ADR-005. It is built here and not written by
 * hand into index.html because it depends on the mode: a fixed policy would be either
 * wrong in development or unsafe in production.
 *
 * The why of the policy, its limitations when served through a meta and how it was
 * verified are in src/lib/csp.ts, which is where it is built.
 */
function contentSecurityPolicy(isDev: boolean): Plugin {
  return {
    name: 'evault-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${securityPolicy({ dev: isDev })}" />`,
        ),
    },
  }
}

export default defineConfig(({ mode }) => {
  return {
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(mode !== 'production'),
  ],
  build: {
    /*
     * The manifest exists for the service worker, and for nothing else.
     *
     * Without it, `public/sw.js` can only precache the assets the entry HTML names —
     * and the route chunks are not among them, because they are loaded lazily. The
     * consequence was measured rather than guessed: with the server off, a first visit
     * rendered nothing and showed the «new version» banner, because `Login`'s chunk had
     * never passed through the worker. From the second visit onwards it worked.
     *
     * With the manifest, everything the build produced is cached on install, so «starts
     * with no network» is true from the first visit — which is what #465 asks for.
     */
    manifest: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['app.evault.localhost'],

    /*
     * For the development server only, and it does NOT affect the bundle: since ADR-016
     * the SPA asks for a relative `/api`, and what routes it in a deployment is Caddy.
     *
     * It exists for the case of starting Vite on its own against `php artisan serve`,
     * with no frontend in front. Whoever uses this project's environment Caddy does not
     * need it: there `app.evault.localhost/api` already reaches PHP-FPM, and this rule
     * never gets looked at because the browser never talks to 5173 directly.
     *
     * The variable carries no `VITE_` prefix on purpose: that way it cannot slip into
     * the bundle through `import.meta.env`, which is exactly what ADR-016 came to
     * remove.
     */
    proxy: {
      '/api': {
        target: process.env.DEV_API_PROXY ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    /*
     * WHY 30s AND NOT VITEST'S 5s DEFAULT — this is #259, and the default was
     * measuring the machine's spare CPU rather than the code.
     *
     * The suite failed intermittently and nobody could name the test. Running it 30
     * times capturing full output: 20 red, 10 green, and the only variable was how
     * busy the machine was. `Test timed out` appeared 52 times.
     *
     * THE NUMBER IS COUNTED FROM THE SLOWEST TEST IN THE SUITE, MEASURED INSIDE THE
     * SUITE. That distinction is the whole reason this had to be fixed twice.
     *
     * The first attempt set 15s by measuring `ItemDialog > creating > saves a new
     * entry with what was typed` on its own: 916ms. But a test running alone does not
     * compete with the other 40 files, and the same test inside a full idle run takes
     * 2242ms — two and a half times more. So the real headroom was 6.7x, not the
     * 16x it looked like, and under load `Unlock > unlocking > opens the vault with
     * the right password` blew through 15s.
     *
     * Slowest inside a full idle run, which is what these numbers must come from. The
     * names are the ones the tests carry since the conversion of #290:
     *
     *   ItemDialog  > saves a new entry             2242ms   <- sets the ceiling
     *   Recover     > warns when it is incomplete   1773ms
     *   Email       > asks for the email twice      1585ms
     *   ExportDialog> does not export with a short  1558ms
     *   Unlock      > opens the vault               1462ms
     *
     * 30s is 13x the slowest. Measured degradation with 2 spinner processes per core
     * is around 3x, and CI runners have 2 cores rather than 20, so that leaves real
     * room instead of apparent room.
     *
     * It hides nothing: a test that genuinely hangs still fails, just later. What
     * stops failing is a correct test on a busy machine, which is all that was ever
     * failing.
     *
     * maxWorkers is deliberately left alone. Capping it would slow every run to buy
     * nothing when the contention comes from outside the suite, which is the case
     * this timeout exists for.
     *
     * Verify with: scripts/suite-under-load.sh — and with nothing else running, or
     * you are measuring a load the criterion never asked for.
     */
    testTimeout: 30_000,
    // The components in components/ui are generated by the shadcn CLI and are not
    // tested, the same way they are not linted with the fast refresh rule.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/pages/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      /*
       * A THRESHOLD OVER lib/vault, AND WHAT IT CLOSES IS NOT «LOW COVERAGE»: IT IS
       * «AN INVISIBLE ZERO».
       *
       * Three times there has been a module at zero without anybody noticing, because
       * the total covered the hole: `ExportDialog` at zero of 39 statements until #202,
       * `masterPassword.ts` at zero of 40 and `recovery.ts` at zero of 107, the last two
       * found while planning Iteration 7 with the web at 89.2 %. All three times it came
       * from reading a table by hand and by chance, while doing something else. That is
       * not a method.
       *
       * `perFile: true` IS NOT REDUNDANT AND CANNOT BE REMOVED, and this was checked by
       * planting a file with no tests to see what happened: without it, a threshold with
       * a glob is evaluated over the AGGREGATE of the files that match, not over each
       * one. A new module at zero of twenty statements leaves the `lib/vault` aggregate
       * well above 80 %, so it would pass — which is exactly the failure this comes to
       * close. With `perFile`, the error names the guilty file.
       *
       * THE NUMBERS ARE MEASURED, not chosen: they come from the real per-file minimum
       * of `lib/vault` —`copy.ts` marks 81.81 of statements and of lines— rounded down,
       * so the threshold GOES IN GREEN. It is the lesson of #62: a check that is born
       * red ends up being ignored entirely.
       *
       * `branches: 70` carries more slack than the others on purpose. The real minimum
       * is the bare 75 of `passwordGenerator.ts`, and a threshold nailed to the edge
       * produces reds from legitimate refactors: that erodes trust in the check, which
       * is the other way of dying of #62. No protection is lost, because a module with
       * no tests is caught by the other three anyway.
       *
       * `functions: 100` is the most demanding and can afford to be: today the functions
       * of `lib/vault` are all covered. It turns any new function without a test running
       * it into a CI failure, which is the exact way the three cases arrived.
       *
       * If one of these numbers ever has to come down, the question is not how far to
       * lower it: it is what code has just been added without being tested.
       */
      thresholds: {
        perFile: true,
        'src/lib/vault/**': {
          statements: 80,
          branches: 70,
          functions: 100,
          lines: 80,
        },
      },
    },
  },
  }
})
