import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Something the reader needs to decide, that is neither an error nor a hint.
 *
 * IT EXISTS BECAUSE THE SAME SENTENCE IS OWED IN THREE PLACES, and `ADR-010` is what
 * owes it: a recovery key survives things people assume kill it. Rotating the master
 * password does not invalidate it, and neither does using it to recover — the wrapper
 * hangs off the vault key, not off the master key. Only regenerating replaces it.
 *
 * `ADR-010` asked for this to be said «where the password is changed, not on a help
 * page», and #309 found the recovery flow saying nothing at all. Three copies of the
 * same Tailwind classes would drift; one component does not.
 */
export function Notice({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="notice"
      className={cn(
        'rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm',
        className,
      )}
      {...props}
    />
  )
}
