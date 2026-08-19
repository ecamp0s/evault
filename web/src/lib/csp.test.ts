import { describe, expect, it } from 'vitest'
import { securityPolicy } from './csp'

/*
 * Una CSP mal ajustada rompe la aplicación de formas que solo se ven en el
 * navegador, y a veces solo en producción. Estos tests no sustituyen esa
 * comprobación —hay que hacerla igual—, pero sí impiden lo que un navegador de
 * desarrollo nunca detectaría: que las concesiones que necesita Vite acaben
 * viajando al build que usan los usuarios.
 */

const IN_PRODUCTION = { dev: false }
const IN_DEV = { dev: true }

/** Las fuentes declaradas para una directiva concreta. */
function sourcesOf(policy: string, directive: string): string[] {
  const found = policy
    .split('; ')
    .find((chunk) => chunk.startsWith(`${directive} `))

  return found ? found.split(' ').slice(1) : []
}

describe('en producción', () => {
  /*
   * El fallo que más caro sale y más fácil es cometer: que las concesiones del
   * modo desarrollo se cuelen en el build. Con 'unsafe-inline' en script-src la
   * política deja de servir para lo único que tiene que servir.
   */
  it('no admite scripts inline ni eval', () => {
    const script = sourcesOf(securityPolicy(IN_PRODUCTION), 'script-src')

    expect(script).toEqual(["'self'"])
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
  })

  it('no deja abierto el WebSocket de recarga en caliente', () => {
    const connections = sourcesOf(securityPolicy(IN_PRODUCTION), 'connect-src')

    expect(connections).not.toContain('ws:')
    expect(connections).not.toContain('wss:')
  })

  /*
   * La directiva que limita a dónde puede mandar datos un script que llegara a
   * ejecutarse. Si aceptara cualquier origen, el resto de la política valdría de
   * poco en un producto cuyo activo son contraseñas.
   */
  it('solo permite hablar con la propia aplicación', () => {
    expect(sourcesOf(securityPolicy(IN_PRODUCTION), 'connect-src')).toEqual(["'self'"])
  })

  /*
   * Desde ADR-016 la API comparte origen con la SPA, así que `'self'` la cubre y no
   * queda ningún origen ajeno que nombrar. Este caso vigila que no vuelva a aparecer
   * uno: un origen externo en `connect-src` sería, en este producto, un sitio al que
   * un script inyectado podría mandar contraseñas.
   */
  it('no nombra ningún origen externo', () => {
    const connections = sourcesOf(securityPolicy(IN_PRODUCTION), 'connect-src')

    expect(connections.filter((source) => source.includes('://'))).toEqual([])
  })
})

describe('en desarrollo', () => {
  /*
   * Criterio explícito del issue: npm run dev tiene que seguir funcionando, HMR
   * incluido. Vite inyecta su cliente como script inline y React Refresh usa eval.
   */
  it('deja arrancar a Vite y a React Refresh', () => {
    const script = sourcesOf(securityPolicy(IN_DEV), 'script-src')

    expect(script).toContain("'unsafe-inline'")
    expect(script).toContain("'unsafe-eval'")
  })

  it('deja abrir el WebSocket de recarga en caliente', () => {
    const connections = sourcesOf(securityPolicy(IN_DEV), 'connect-src')

    expect(connections).toContain('ws:')
  })
})

describe('en los dos modos', () => {
  it.each([
    ['object-src', "'none'"],
    ['frame-src', "'none'"],
    ['worker-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
  ])('cierra %s, que la aplicación no usa', (directive, expected) => {
    for (const options of [IN_PRODUCTION, IN_DEV]) {
      expect(sourcesOf(securityPolicy(options), directive)).toEqual([expected])
    }
  })

  /*
   * Base UI, debajo de shadcn, escribe la posición de diálogos y menús como
   * atributo style. Sin esta concesión las capas flotantes aparecen en la esquina de
   * la pantalla, y es un fallo que no se ve hasta abrir una.
   */
  it('admite estilos inline, que Base UI necesita para posicionar', () => {
    expect(sourcesOf(securityPolicy(IN_PRODUCTION), 'style-src')).toContain("'unsafe-inline'")
  })

  it('parte de default-src propio', () => {
    expect(securityPolicy(IN_PRODUCTION).startsWith("default-src 'self'")).toBe(true)
  })
})
