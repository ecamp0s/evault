import { describe, expect, it } from 'vitest'
// Con ?raw y no leyendo el fichero con node:fs: así el test no necesita los tipos
// de Node en tsconfig.app.json, que obligarían a exponer las APIs del sistema a
// todo el código de cliente, y tampoco depende del directorio desde el que se
// invoque Vitest.
import html from '../../index.html?raw'

/*
 * La capa que impide que un arranque fallido se manifieste como una página en
 * blanco. Ver el issue #107.
 *
 * Este fichero no prueba una función: protege una promesa. Lo que vigila es que
 * nadie pueda dejar la aplicación muda sin que falle algo, vaciando el aviso de
 * index.html.
 *
 * HASTA EL ISSUE #296 vigilaba también una segunda capa, `assertApiUrl`, que
 * abortaba el arranque cuando faltaba `VITE_API_URL`. Esa comprobación se retiró
 * con la variable: desde ADR-016 la URL de la API es relativa y no hay nada que
 * configurar, así que no queda configuración que pueda faltar.
 */

describe('un arranque fallido nunca es una página en blanco', () => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const root = document.querySelector('#root')

  it('index.html deja un aviso dentro de #root', () => {
    expect(root).not.toBeNull()
    expect(root?.textContent?.trim()).not.toBe('')
  })

  it('el aviso explica qué hacer, no solo que algo ha fallado', () => {
    expect(root?.textContent).toContain('docker compose up --build')
  })

  /*
   * index.css se importa desde main.tsx, que es exactamente lo que no se ha
   * ejecutado cuando este aviso queda a la vista. Si alguien mueve estos estilos a
   * una hoja de la aplicación, el aviso seguiría estando en el DOM pero se vería
   * como texto sin formato, y el test seguiría pasando sin este caso.
   */
  it('el aviso no depende del CSS de la aplicación, que no ha llegado a cargarse', () => {
    const withOwnStyles = root?.querySelectorAll('[style]') ?? []

    expect(withOwnStyles.length).toBeGreaterThan(0)
  })
})
