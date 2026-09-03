import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Whether the server actually answers, asked rather than assumed.
 *
 * WHY NOT `navigator.onLine`, WHICH IS THE OBVIOUS ANSWER AND THE WRONG ONE: it reports
 * whether the device is attached to a network, not whether kastor is on the other end. A
 * captive portal, a dropped tailnet and a server that is simply off all read as «online».
 * A screen built on that would tell somebody they are connected while nothing answers,
 * which is worse than saying nothing at all. The same reasoning is in `OfflineNotice`.
 *
 * `GET /api/health` is public, needs no session and carries nothing, so asking costs a
 * request that was measured before being written: on the tailnet, a stopped server
 * refuses the connection in 9-23 ms and a name that does not resolve fails in 4-8 ms.
 *
 * IT NEVER BLOCKS ANYTHING. It starts as `checking` and whoever reads it paints as if
 * there were nothing to say, so a slow answer delays no screen — it only arrives late.
 */
export type Reachability = 'checking' | 'reachable' | 'unreachable'

export function useServerReachable(): Reachability {
  const [reachability, setReachability] = useState<Reachability>('checking')

  useEffect(() => {
    let current = true

    const settle = (value: Reachability) => {
      // The screen can be gone before the answer: unlocking navigates away.
      if (current) setReachability(value)
    }

    api
      .get('/health')
      .then(() => settle('reachable'))
      .catch(() => settle('unreachable'))

    return () => {
      current = false
    }
  }, [])

  return reachability
}
