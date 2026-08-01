import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/*
 * lib/api.ts aborta al importarse si falta VITE_API_URL. Es el comportamiento
 * buscado en la aplicación, pero en los tests hay que darle un valor o cualquier
 * fichero que lo importe fallaría antes de ejecutar nada.
 */
import.meta.env.VITE_API_URL = 'http://api.test/api'

/*
 * jsdom no implementa matchMedia, y sonner lo llama al montar el Toaster para
 * saber si el sistema pide menos animación. Sin este apaño, cualquier test que
 * compruebe un aviso revienta antes de llegar a la aserción.
 *
 * Responde siempre que no hay coincidencia, que equivale a las preferencias por
 * defecto del sistema.
 */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

beforeEach(() => {
  // El store de sesión persiste en localStorage. Sin limpiarlo, un test que
  // autentica deja al siguiente con sesión abierta y el orden de ejecución pasa a
  // importar, que es la clase de fallo intermitente más cara de diagnosticar.
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
