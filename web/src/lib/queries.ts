import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

/**
 * TanStack Query's configuration for the whole application.
 *
 * What is NOT done here is as important as what is: the cache is not persisted. Storing
 * it in localStorage or in IndexedDB would leave the already decoded items on disk,
 * which is exactly what a zero-knowledge manager does not do. The cache lives in memory
 * and dies when the tab closes. See ADR-001.
 *
 * The provider that mounts it is in components/queries.tsx. They are separate because
 * the linter's fast refresh rule does not admit a file exporting both a component and
 * loose functions.
 */

/**
 * A 401 is not retried.
 *
 * session.ts's interceptor already closes the session on receiving it, so retrying only
 * delays the eviction and fires two more requests with a token already known to be
 * invalid. The same holds for the rest of the client errors: a 404 or a 422 do not
 * improve by being repeated. What is retried is what can be transient — network
 * failures and 5xx.
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
         * Thirty seconds of freshness. A vault does not change on its own from another
         * device every few seconds, and without this every return to the tab would fire
         * a request that almost always returns the same thing.
         */
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // A mutation that fails does not repeat itself: retrying a creation could
        // duplicate the entry, and the user is right there to decide.
        retry: false,
      },
    },
  })
}
