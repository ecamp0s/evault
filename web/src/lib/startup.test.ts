import { describe, expect, it } from 'vitest'
// Con ?raw y no leyendo el fichero con node:fs: así el test no necesita los tipos
// de Node en tsconfig.app.json, que obligarían a exponer las APIs del sistema a
// todo el código de cliente, y tampoco depende del directorio desde el que se
// invoque Vitest.
import html from '../../index.html?raw'
import { MISSING_API_URL_MESSAGE, assertApiUrl } from '@/lib/env'

/*
 * Las dos capas que impiden que un arranque fallido se manifieste como una página
 * en blanco. Ver el issue #107 y src/lib/env.ts.
 *
 * Este fichero no prueba una función: protege una promesa. Lo que vigila es que
 * nadie pueda dejar la aplicación muda sin que falle algo, ni vaciando el aviso de
 * index.html ni quitando la comprobación del arranque.
 */

describe('la configuración que falta se detecta al arrancar', () => {
  it('acepta una URL de API definida', () => {
    expect(() => assertApiUrl('http://localhost:8000/api')).not.toThrow()
  })

  it('rechaza que no haya URL de API', () => {
    expect(() => assertApiUrl(undefined)).toThrow(MISSING_API_URL_MESSAGE)
  })

  it('rechaza una URL de API vacía, que es lo que deja un .env a medio rellenar', () => {
    expect(() => assertApiUrl('')).toThrow(MISSING_API_URL_MESSAGE)
  })

  /*
   * El contenido del mensaje importa tanto como que se lance. Quien lo lee acaba de
   * saltarse un paso del arranque, así que necesita el comando exacto y no el
   * nombre de la variable, que es lo que ya no le dijo nada la primera vez.
   */
  it('dice qué fichero copiar y no solo qué variable falta', () => {
    expect(MISSING_API_URL_MESSAGE).toContain('cp .env.example .env')
    expect(MISSING_API_URL_MESSAGE).toContain('VITE_API_URL')
  })
})

describe('un arranque fallido nunca es una página en blanco', () => {
  const documento = new DOMParser().parseFromString(html, 'text/html')
  const raiz = documento.querySelector('#root')

  it('index.html deja un aviso dentro de #root', () => {
    expect(raiz).not.toBeNull()
    expect(raiz?.textContent?.trim()).not.toBe('')
  })

  it('el aviso explica qué hacer, no solo que algo ha fallado', () => {
    expect(raiz?.textContent).toContain('cp .env.example .env')
  })

  /*
   * index.css se importa desde main.tsx, que es exactamente lo que no se ha
   * ejecutado cuando este aviso queda a la vista. Si alguien mueve estos estilos a
   * una hoja de la aplicación, el aviso seguiría estando en el DOM pero se vería
   * como texto sin formato, y el test seguiría pasando sin este caso.
   */
  it('el aviso no depende del CSS de la aplicación, que no ha llegado a cargarse', () => {
    const conEstilosPropios = raiz?.querySelectorAll('[style]') ?? []

    expect(conEstilosPropios.length).toBeGreaterThan(0)
  })
})
