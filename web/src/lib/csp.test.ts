import { describe, expect, it } from 'vitest'
import { politicaDeSeguridad } from './csp'

/*
 * Una CSP mal ajustada rompe la aplicación de formas que solo se ven en el
 * navegador, y a veces solo en producción. Estos tests no sustituyen esa
 * comprobación —hay que hacerla igual—, pero sí impiden lo que un navegador de
 * desarrollo nunca detectaría: que las concesiones que necesita Vite acaben
 * viajando al build que usan los usuarios.
 */

const EN_PRODUCCION = { apiUrl: 'https://api.evault.app/api', desarrollo: false }
const EN_DESARROLLO = { apiUrl: 'http://api.evault.claude/api', desarrollo: true }

/** Las fuentes declaradas para una directiva concreta. */
function fuentesDe(politica: string, directiva: string): string[] {
  const encontrada = politica
    .split('; ')
    .find((trozo) => trozo.startsWith(`${directiva} `))

  return encontrada ? encontrada.split(' ').slice(1) : []
}

describe('en producción', () => {
  /*
   * El fallo que más caro sale y más fácil es cometer: que las concesiones del
   * modo desarrollo se cuelen en el build. Con 'unsafe-inline' en script-src la
   * política deja de servir para lo único que tiene que servir.
   */
  it('no admite scripts inline ni eval', () => {
    const script = fuentesDe(politicaDeSeguridad(EN_PRODUCCION), 'script-src')

    expect(script).toEqual(["'self'"])
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
  })

  it('no deja abierto el WebSocket de recarga en caliente', () => {
    const conexiones = fuentesDe(politicaDeSeguridad(EN_PRODUCCION), 'connect-src')

    expect(conexiones).not.toContain('ws:')
    expect(conexiones).not.toContain('wss:')
  })

  /*
   * La directiva que limita a dónde puede mandar datos un script que llegara a
   * ejecutarse. Si aceptara cualquier origen, el resto de la política valdría de
   * poco en un producto cuyo activo son contraseñas.
   */
  it('solo permite hablar con la propia aplicación y con su API', () => {
    expect(fuentesDe(politicaDeSeguridad(EN_PRODUCCION), 'connect-src')).toEqual([
      "'self'",
      'https://api.evault.app',
    ])
  })

  it('usa el origen de la API y no la ruta completa', () => {
    const politica = politicaDeSeguridad(EN_PRODUCCION)

    expect(politica).toContain('https://api.evault.app')
    expect(politica).not.toContain('/api;')
  })
})

describe('en desarrollo', () => {
  /*
   * Criterio explícito del issue: npm run dev tiene que seguir funcionando, HMR
   * incluido. Vite inyecta su cliente como script inline y React Refresh usa eval.
   */
  it('deja arrancar a Vite y a React Refresh', () => {
    const script = fuentesDe(politicaDeSeguridad(EN_DESARROLLO), 'script-src')

    expect(script).toContain("'unsafe-inline'")
    expect(script).toContain("'unsafe-eval'")
  })

  it('deja abrir el WebSocket de recarga en caliente', () => {
    const conexiones = fuentesDe(politicaDeSeguridad(EN_DESARROLLO), 'connect-src')

    expect(conexiones).toContain('ws:')
  })
})

describe('en los dos modos', () => {
  it.each([
    ['object-src', "'none'"],
    ['frame-src', "'none'"],
    ['worker-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
  ])('cierra %s, que la aplicación no usa', (directiva, esperado) => {
    for (const opciones of [EN_PRODUCCION, EN_DESARROLLO]) {
      expect(fuentesDe(politicaDeSeguridad(opciones), directiva)).toEqual([esperado])
    }
  })

  /*
   * Base UI, debajo de shadcn, escribe la posición de diálogos y menús como
   * atributo style. Sin esta concesión las capas flotantes aparecen en la esquina de
   * la pantalla, y es un fallo que no se ve hasta abrir una.
   */
  it('admite estilos inline, que Base UI necesita para posicionar', () => {
    expect(fuentesDe(politicaDeSeguridad(EN_PRODUCCION), 'style-src')).toContain("'unsafe-inline'")
  })

  it('parte de default-src propio', () => {
    expect(politicaDeSeguridad(EN_PRODUCCION).startsWith("default-src 'self'")).toBe(true)
  })
})

/*
 * VITE_API_URL es obligatoria y lib/api.ts aborta si falta, así que este caso no se
 * da en la aplicación. Se comprueba igualmente porque la alternativa a devolver una
 * política sin el origen sería devolver una rota, y una CSP rota rompe la página
 * entera en vez de fallar donde está el problema.
 */
describe('si la URL de la API no es válida', () => {
  it('deja la política en pie sin inventarse un origen', () => {
    const politica = politicaDeSeguridad({ apiUrl: 'esto-no-es-una-url', desarrollo: false })

    expect(fuentesDe(politica, 'connect-src')).toEqual(["'self'"])
    expect(politica).toContain("default-src 'self'")
  })
})
