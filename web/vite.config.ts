// defineConfig viene de vitest/config y no de vite: extiende el de Vite con la
// clave `test`, y así la configuración de la aplicación y la de los tests son la
// misma. Importarlo de 'vite' compilaría, pero `test` quedaría sin tipar.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// import.meta.dirname y no __dirname: el cargador nativo de configuración de Vite
// no soporta __dirname y avisa de que pasará a ser el modo por defecto.
const raiz = import.meta.dirname

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
})
