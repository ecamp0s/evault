// defineConfig comes from vitest/config and not from vite, as in the web: it extends
// Vite's with the `test` block, so the build and the tests read one file.
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import { parseOrigins } from './src/instance.ts'
import { buildFirefoxManifest, buildManifest } from './src/manifest.ts'
import { parseBrowser, type Browser } from './src/target.ts'

const origins = parseOrigins(process.env.EVAULT_EXTENSION_ORIGINS)
const browser = parseBrowser(process.env.EVAULT_EXTENSION_BROWSER)

/**
 * Writes the manifest at build time, because its host permissions are the instance's
 * origins and those are not in the repository. What it contains is src/manifest.ts, where
 * it is tested.
 */
function manifest(): Plugin {
  return {
    name: 'evault-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(TARGETS[browser].manifest(origins), null, 2),
      })
    },
  }
}

const page = (name: string) => fileURLToPath(new URL(`./src/${name}`, import.meta.url))

/**
 * What each browser's build is made of (ADR-025 §2.8): its manifest and its pages. The
 * popup is the same everywhere; what holds the key and what runs in the background are
 * the browser's own, under src/platform/<browser>/.
 */
const TARGETS: Record<Browser, { manifest: (origins: string[]) => object; input: Record<string, string>; outDir: string }> = {
  chrome: {
    manifest: buildManifest,
    outDir: '../dist',
    input: {
      popup: page('popup.html'),
      offscreen: page('offscreen.html'),
      background: page('platform/chrome/background.ts'),
    },
  },
  // Its own folder, so a Chrome build loaded unpacked is not overwritten by a Firefox one.
  firefox: {
    manifest: buildFirefoxManifest,
    outDir: '../dist-firefox',
    input: {
      popup: page('popup.html'),
      background: page('background.html'),
    },
  },
}

export default defineConfig({
  root: 'src',
  // Relative, because an extension page is served from chrome-extension://<id>/ and an
  // absolute /assets path would resolve against that root only by accident.
  base: './',
  plugins: [manifest()],
  define: {
    __INSTANCE_ORIGINS__: JSON.stringify(origins),
    __BROWSER__: JSON.stringify(browser),
  },
  resolve: {
    // The same alias the web uses, pointing at the web's src/: see tsconfig.app.json.
    alias: { '@': fileURLToPath(new URL('../web/src', import.meta.url)) },
  },
  build: {
    outDir: TARGETS[browser].outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: TARGETS[browser].input,
      output: {
        // The manifest names the service worker, so its file cannot carry a hash.
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    environment: 'node',
  },
})
