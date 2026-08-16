/**
 * La Content-Security-Policy de la SPA.
 *
 * Vive aquí, en el cliente, y no en la configuración de Caddy, por lo que pide
 * ADR-005: el mismo build tiene que servir al SaaS y a un despliegue self-hosted
 * sin que el operador tenga que replicar una configuración de proxy que no conoce.
 * Se inyecta como `<meta http-equiv>` en el HTML durante el build. Ver vite.config.ts.
 *
 * Por qué importa aquí más que en otras aplicaciones: desde la Iteración 3 este
 * origen sostiene en memoria la clave que descifra la vault del usuario. Un script
 * ejecutándose aquí no roba una sesión, roba las contraseñas. ADR-007 lo dice
 * expresamente: que el token deje de persistirse reduce el botín de un XSS, no la
 * probabilidad de que ocurra. Esto ataca la probabilidad.
 *
 * Limitación conocida de servirla por meta, y es real: `frame-ancestors`,
 * `report-uri` y `report-to` **se ignoran** en un meta, así que la protección
 * contra clickjacking y el reporte de violaciones exigen una cabecera de verdad.
 * Quien despliegue detrás de un proxy puede añadirla allí sin tocar el build, y la
 * API sí las lleva porque las sirve Laravel; ver app/Http/Middleware/SecurityHeaders.php.
 *
 * Tampoco hay modo `Report-Only`: esa cabecera se ignora en un meta igual que las
 * anteriores. Por eso la verificación de que no rompe nada se hizo recorriendo la
 * aplicación entera en el navegador, con el build de producción y no solo con el de
 * desarrollo, que es más permisivo.
 */

/** Las fuentes que necesita Vite en desarrollo y que jamás deben viajar a producción. */
const DEV_ONLY = {
  /*
   * Vite inyecta el cliente de HMR como script inline y React Refresh usa eval.
   * Sin esto no arranca `npm run dev`, que es exactamente lo que el issue pide no
   * romper. En el build de producción no aparece ninguna de las dos.
   */
  script: ["'unsafe-inline'", "'unsafe-eval'"],
  /* El WebSocket por el que Vite avisa de los cambios. */
  connect: ['ws:', 'wss:'],
}

/** Extrae el origen de una URL, que es lo que entiende una directiva de CSP. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export interface CspOptions {
  /** El valor de VITE_API_URL. La política necesita su origen, no la ruta. */
  apiUrl: string
  dev: boolean
}

/**
 * Construye la política. Es una función y no una constante porque el origen de la
 * API viene de una variable de entorno y las fuentes de desarrollo no pueden
 * filtrarse a producción.
 */
export function securityPolicy({ apiUrl, dev }: CspOptions): string {
  const apiOrigin = originOf(apiUrl)

  const directives: Record<string, string[]> = {
    /* Todo lo que no tenga directiva propia cae aquí, y aquí solo se admite lo propio. */
    'default-src': ["'self'"],

    'script-src': ["'self'", ...(dev ? DEV_ONLY.script : [])],

    /*
     * 'unsafe-inline' en los estilos, y no es un descuido que se pueda quitar hoy:
     * Base UI —debajo de shadcn con el preset base-nova— calcula la posición de
     * diálogos y menús y la escribe como atributo style. Sin esto, cualquier capa
     * flotante aparece en la esquina superior izquierda.
     *
     * El riesgo que se acepta es acotado: con 'unsafe-inline' en estilos se puede
     * exfiltrar información con selectores CSS, pero hace falta poder inyectar el
     * estilo, y eso ya exige el XSS que script-src impide.
     */
    'style-src': ["'self'", "'unsafe-inline'"],

    /* data: por los iconos y por cualquier SVG embebido. */
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],

    /*
     * La API vive en otro origen, así que hay que nombrarla. Es la directiva que
     * más trabajo hace en este producto: limita a dónde puede mandar datos un
     * script que llegara a ejecutarse.
     */
    'connect-src': [
      "'self'",
      ...(apiOrigin ? [apiOrigin] : []),
      ...(dev ? DEV_ONLY.connect : []),
    ],

    /* Nada de esto se usa, así que se cierra en vez de dejarlo heredar de default-src. */
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'none'"],
    'manifest-src': ["'self'"],

    /* Impide que un <base> inyectado redirija todas las rutas relativas. */
    'base-uri': ["'none'"],

    /*
     * Ningún formulario de la aplicación navega: todos se manejan en JavaScript y
     * mandan por axios. Cerrarlo bloquea la vía más simple de exfiltrar lo que el
     * usuario escriba, que en un gestor de contraseñas es su contraseña maestra.
     */
    'form-action': ["'none'"],
  }

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}
