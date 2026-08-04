import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

/**
 * Configuración de TanStack Query para toda la aplicación.
 *
 * Lo que NO se hace aquí es tan importante como lo que sí: la caché no se
 * persiste. Guardarla en localStorage o en IndexedDB dejaría en disco los items ya
 * descodificados, que es exactamente lo que un gestor zero-knowledge no hace. La
 * caché vive en memoria y muere al cerrar la pestaña. Ver ADR-001.
 *
 * El provider que la monta está en components/queries.tsx. Están separados
 * porque la regla de fast refresh del linter no admite que un fichero exporte a la
 * vez un componente y funciones sueltas.
 */

/**
 * Un 401 no se reintenta.
 *
 * El interceptor de sesion.ts ya cierra la sesión al recibirlo, así que reintentar
 * solo retrasa la expulsión y dispara dos peticiones más con un token que ya se
 * sabe inválido. Lo mismo vale para el resto de errores del cliente: un 404 o un
 * 422 no mejoran por repetirlos. Se reintenta lo que sí puede ser pasajero, es
 * decir los fallos de red y los 5xx.
 */
function retry(attempts: number, error: unknown): boolean {
  if (error instanceof ApiError && error.state !== null && error.state < 500) {
    return false
  }

  return attempts < 2
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retry,
        /*
         * Treinta segundos de frescura. Una vault no cambia sola desde otro
         * dispositivo cada pocos segundos, y sin esto cada vuelta a la pestaña
         * dispararía una petición que casi siempre devuelve lo mismo.
         */
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Una mutación que falla no se repite sola: reintentar un alta podría
        // duplicar la entrada, y el usuario está delante para decidir.
        retry: false,
      },
    },
  })
}
