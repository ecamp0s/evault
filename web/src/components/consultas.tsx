import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { crearQueryClient } from '@/lib/consultas'

/**
 * Provider de TanStack Query.
 *
 * El cliente se crea una sola vez, fuera del componente. Crearlo dentro haría uno
 * nuevo en cada render y la caché se vaciaría sin motivo aparente.
 *
 * La configuración vive en lib/consultas.ts, incluida la decisión de no persistir
 * la caché en disco.
 */
const queryClient = crearQueryClient()

export function Consultas({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
