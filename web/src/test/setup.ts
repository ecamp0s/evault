import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { toast } from 'sonner'

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
  /*
   * LOS AVISOS DE SONNER NO VIVEN EN EL ÁRBOL DE REACT. Su estado es global al
   * módulo, así que `cleanup()` desmonta el Toaster y los deja donde estaban; al
   * montar el siguiente, reaparecen, y un test acaba viendo los avisos de los
   * anteriores.
   *
   * Encontrado en #232 al investigar por qué la actualización de sonner a 2.0.8
   * ponía en rojo dos tests de `copy.test.tsx` con «Found multiple elements». No era
   * una duplicación del componente ni un nodo extra de accesibilidad —un aviso suelto
   * produce exactamente un nodo, comprobado— sino tres avisos acumulados de tres
   * tests distintos.
   *
   * El arreglo tentador era cambiar `getByText` por `getAllByText`, y habría sido
   * peor que el problema: deja la fuga viva, y una fuga así hace que un test pase o
   * falle SEGÚN EL ORDEN DE EJECUCIÓN. Es exactamente el fallo de #186, que costó un
   * PR ajeno en rojo.
   */
  toast.dismiss()
  cleanup()
})
