// defineConfig viene de vitest/config y no de vite: extiende el de Vite con la
// clave `test`, y así la configuración de la aplicación y la de los tests son la
// misma. Importarlo de 'vite' compilaría, pero `test` quedaría sin tipar.
import { defineConfig, type Plugin } from 'vitest/config'
// loadEnv viene de vite: vitest/config reexporta defineConfig, pero no las utilidades.
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
// Con extensión, que es lo que pide el cargador nativo de configuración de Vite.
// Sin ella avisa en cada arranque, y `allowImportingTsExtensions` del
// tsconfig.node.json permite escribirla sin que se queje la comprobación de tipos.
import { securityPolicy } from './src/lib/csp.ts'
import { assertApiUrl } from './src/lib/env.ts'

// import.meta.dirname y no __dirname: el cargador nativo de configuración de Vite
// no soporta __dirname y avisa de que pasará a ser el modo por defecto.
const projectRoot = import.meta.dirname

/**
 * Inyecta la Content-Security-Policy en el HTML como meta.
 *
 * Va en el build y no en la configuración de Caddy porque el mismo artefacto tiene
 * que servir al SaaS y a un self-hosted, según ADR-005. Se construye aquí y no se
 * escribe a mano en index.html porque depende del modo y de VITE_API_URL: una
 * política fija sería incorrecta en desarrollo o insegura en producción.
 *
 * El porqué de la política, sus limitaciones al servirse por meta y cómo se
 * verificó están en src/lib/csp.ts, que es donde se construye.
 */
function contentSecurityPolicy(apiUrl: string, isDev: boolean): Plugin {
  return {
    name: 'evault-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${securityPolicy({ apiUrl, dev: isDev })}" />`,
        ),
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_')

  /*
   * Solo al levantar el servidor de desarrollo. Ni al construir, porque el CI
   * compila sin copiar el .env y lo dejaría en rojo, ni bajo Vitest, porque los
   * tests inyectan la variable en su propio setup y aquí todavía no ha corrido.
   * Ver src/lib/env.ts y el issue #107.
   */
  if (command === 'serve' && mode !== 'test' && !process.env.VITEST) {
    assertApiUrl(env.VITE_API_URL)
  }

  return {
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(env.VITE_API_URL ?? '', mode !== 'production'),
  ],
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
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    /*
     * WHY 15s AND NOT VITEST'S 5s DEFAULT — this is #259, and the default was
     * measuring the machine's spare CPU rather than the code.
     *
     * The suite failed intermittently and nobody could name the test. Running it
     * 30 times capturing full output: 20 red, 10 green, and the only variable was
     * how busy the machine was. `Test timed out in 5000ms` appeared 52 times.
     *
     * The slowest test takes ~916ms idle and 2643ms with 40 spinners running.
     * Against a 5s ceiling that is the thinnest margin in the suite, which is why
     * it fell first — not because it does anything special. It renders React into
     * jsdom and types with userEvent, character by character.
     *
     * THIS IS THE LINE THAT FIXES IT, and that is measured rather than assumed:
     * reverting just this one to 5s puts `ItemDialog > crear > guarda una entrada
     * nueva` back in red 5 runs out of 5, while every other part of the fix stays
     * in place. Reverting the other pieces instead leaves the suite green.
     *
     * 15s leaves ~16x of headroom over the slowest test and hides nothing: a test
     * that genuinely hangs still fails, 10s later. What stops failing is a correct
     * test on a busy machine, which is all that was failing.
     *
     * It matters more on CI than here: runners have 2 cores, not 20, so the
     * squeeze that has to be provoked on a workstation is normal there.
     *
     * maxWorkers is deliberately left alone. Capping it would slow every run to
     * buy nothing when the contention comes from outside the suite, which is the
     * case this timeout exists for.
     *
     * Verify with: scripts/suite-under-load.sh
     */
    testTimeout: 15_000,
    // Los componentes de components/ui los genera el CLI de shadcn y no se
    // testean, igual que no se lintan con la regla de fast refresh.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/pages/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      /*
       * UMBRAL SOBRE lib/vault, Y LO QUE CIERRA NO ES «POCA COBERTURA»: ES «CERO
       * INVISIBLE».
       *
       * Tres veces ha habido un módulo a cero sin que nadie se enterara, porque el
       * total tapaba el hueco: `ExportDialog` a cero de 39 sentencias hasta #202,
       * `masterPassword.ts` a cero de 40 y `recovery.ts` a cero de 107, los dos
       * encontrados al planificar la Iteración 7 con la web al 89,2 %. Las tres veces
       * se dieron con leer una tabla a mano y por casualidad, mientras se hacía otra
       * cosa. Eso no es un método.
       *
       * `perFile: true` NO ES REDUNDANTE Y NO SE PUEDE QUITAR, y esto se comprobó
       * plantando un fichero sin tests para ver qué pasaba: sin él, un umbral con glob
       * se evalúa sobre el AGREGADO de los ficheros que casan, no sobre cada uno. Un
       * módulo nuevo a cero de veinte sentencias deja el agregado de `lib/vault` muy
       * por encima del 80 %, así que pasaría — que es exactamente el fallo que esto
       * viene a cerrar. Con `perFile`, el error nombra el fichero culpable.
       *
       * LOS NÚMEROS ESTÁN MEDIDOS, no elegidos: vienen del mínimo real por fichero de
       * `lib/vault` —`copy.ts` marca 81,81 de sentencias y de líneas— redondeado hacia
       * abajo, así que el umbral ENTRA EN VERDE. Es la lección de #62: un check que
       * nace en rojo se acaba ignorando entero.
       *
       * `branches: 70` lleva más holgura que los otros a propósito. El mínimo real es
       * el 75 justo de `passwordGenerator.ts`, y un umbral clavado en el borde produce
       * rojos por refactores legítimos: eso erosiona la confianza en el check, que es
       * la otra forma de morir de #62. La protección no se pierde, porque un módulo sin
       * tests lo cazan igualmente los otros tres.
       *
       * `functions: 100` es el más exigente y puede permitírselo: hoy las funciones de
       * `lib/vault` están todas cubiertas. Convierte en fallo de CI cualquier función
       * nueva sin un test que la ejecute, que es la forma exacta en que llegaron los
       * tres casos.
       *
       * Si algún día hay que bajar uno de estos números, la pregunta no es cuánto
       * bajarlo: es qué código se acaba de añadir sin probar.
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
