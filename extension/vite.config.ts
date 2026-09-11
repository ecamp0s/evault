// defineConfig comes from vitest/config and not from vite, as in the web: it extends
// Vite's with the `test` block, so the build and the tests read one file.
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import { parseOrigins } from './src/instance.ts'

const origins = parseOrigins(process.env.EVAULT_EXTENSION_ORIGINS)

/**
 * The manifest, written at build time because its host permissions are the instance's
 * origins and those are not in the repository (src/instance.ts).
 *
 * THE PERMISSIONS ARE THE ONES THIS BUILD USES, AND NONE MORE. ADR-023 §4 lists what the
 * finished extension will ask for —offscreen, storage, activeTab, scripting, idle,
 * clipboardWrite— and each arrives with the issue that needs it, not before: a permission
 * declared ahead of its code is a promise about behaviour that nothing exercises yet.
 */
function manifest(): Plugin {
  return {
    name: 'evault-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(
          {
            manifest_version: 3,
            name: 'eVault',
            version: '0.0.1',
            description: 'Tu vault de eVault desde la barra del navegador.',
            action: { default_popup: 'popup.html' },
            host_permissions: origins.map((origin) => `${origin}/*`),
          },
          null,
          2,
        ),
      })
    },
  }
}

export default defineConfig({
  root: 'src',
  // Relative, because an extension page is served from chrome-extension://<id>/ and an
  // absolute /assets path would resolve against that root only by accident.
  base: './',
  plugins: [manifest()],
  define: {
    __INSTANCE_ORIGINS__: JSON.stringify(origins),
  },
  resolve: {
    // The same alias the web uses, pointing at the web's src/: see tsconfig.app.json.
    alias: { '@': fileURLToPath(new URL('../web/src', import.meta.url)) },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: fileURLToPath(new URL('./src/popup.html', import.meta.url)) },
    },
  },
  test: {
    environment: 'node',
  },
})
