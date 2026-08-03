/**
 * Comprobación de la configuración de entorno que la SPA necesita para arrancar.
 *
 * Vive en su propio módulo, y no dentro de `vite.config.ts`, para que se pueda
 * testear: la configuración de Vite no es importable desde los tests sin arrastrar
 * medio bundler detrás.
 *
 * El problema que resuelve está en el issue #107. Sin `VITE_API_URL`, `lib/api.ts`
 * aborta al importarse, eso rompe la cadena de importación de `main.tsx`, React no
 * llega a montar y lo que se ve es **una página en blanco**. El mensaje de error
 * existe y es correcto, pero está en la consola del navegador, que es justo donde
 * no mira quien acaba de teclear `npm run dev`.
 *
 * La respuesta va en dos capas y esta es la primera: que el servidor de desarrollo
 * no llegue a arrancar, y que lo diga en la terminal. La segunda es el aviso que
 * `index.html` deja dentro de `#root`, que cubre cualquier otro fallo de arranque
 * y no solo este.
 */

/**
 * El mensaje, separado de la función que lo lanza para poder afirmarlo en un test
 * sin depender de cómo se propague el error.
 *
 * Dice qué falta, qué hay que ejecutar y dónde está el porqué. Un mensaje que solo
 * dijera «falta VITE_API_URL» obligaría a ir a buscar el nombre del fichero de
 * ejemplo, que es exactamente el paso que alguien acaba de saltarse.
 */
export const MISSING_API_URL_MESSAGE = `Falta VITE_API_URL, así que la aplicación no puede saber dónde está la API.

La SPA no asume ningún dominio: la URL se configura por entorno, según ADR-005.
Copia el fichero de ejemplo desde web/ y vuelve a arrancar:

    cp .env.example .env

Si la API no está en el puerto por defecto de \`php artisan serve\`, ajusta el
valor. El arranque completo está en el README.`

/**
 * Aborta si no hay URL de API configurada.
 *
 * Se llama desde `vite.config.ts` solo al levantar el servidor de desarrollo. No se
 * llama al construir: un build sin la variable produce un artefacto que no funciona,
 * pero romper ahí dejaría el CI en rojo por una configuración que en integración no
 * se copia. Ese caso lo cubre el aviso de `index.html`, que es visible en pantalla.
 */
export function assertApiUrl(value: string | undefined): void {
  if (value) {
    return
  }

  throw new Error(MISSING_API_URL_MESSAGE)
}
