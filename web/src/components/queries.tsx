import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createQueryClient } from '@/lib/queries'

/**
 * TanStack Query's provider.
 *
 * The client is created once, outside the component. Creating it inside would make a
 * new one on every render and the cache would empty for no apparent reason.
 *
 * The configuration lives in lib/consultas.ts, including the decision not to persist the
 * cache to disk.
 */
const queryClient = createQueryClient()

export function Queries({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
