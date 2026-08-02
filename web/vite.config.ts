// defineConfig viene de vitest/config y no de vite: extiende el de Vite con la
// clave `test`, y así la configuración de la aplicación y la de los tests son la
// misma. Importarlo de 'vite' compilaría, pero `test` quedaría sin tipar.
import { defineConfig, type Plugin } from 'vitest/config'
// loadEnv viene de vite: vitest/config reexporta defineConfig, pero no las utilidades.
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { politicaDeSeguridad } from './src/lib/csp'

// import.meta.dirname y no __dirname: el cargador nativo de configuración de Vite
// no soporta __dirname y avisa de que pasará a ser el modo por defecto.
const raiz = import.meta.dirname

/**
 * Inyecta la Content-Security-Policy en el HTML como meta.
 *
 * Va en el build y no en la configuración de Caddy porque el mismo artefacto tiene
 * que servir al SaaS y a un self-hosted, según ADR-005. Se construye aquí y no se
 * escribe a mano en index.html porque depende del modo y de VITE_API_URL: una
 * política fija sería incorrecta en desarrollo o insegura en producción.
 *
 * Ver src/lib/csp.ts y docs/architecture/SEGURIDAD.md.
 */
function contentSecurityPolicy(apiUrl: string, desarrollo: boolean): Plugin {
  return {
    name: 'evault-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${politicaDeSeguridad({ apiUrl, desarrollo })}" />`,
        ),
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, raiz, 'VITE_')

  return {
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(env.VITE_API_URL ?? '', mode !== 'production'),
  ],
  resolve: {
    alias: {
      '@': path.resolve(raiz, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['app.evault.claude'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    // Los componentes de components/ui los genera el CLI de shadcn y no se
    // testean, igual que no se lintan con la regla de fast refresh.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/pages/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
    },
  },
  }
})
