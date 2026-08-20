/**
 * TanStack Query cache keys.
 *
 * Centralised because a key hand-written in two places that do not match produces the
 * hardest failure to see: the mutation invalidates one entry and the screen reads
 * another, so the interface sits on stale data with no error anywhere.
 *
 * The vaultId is always part of the key. Were it not, switching vaults would show the
 * previous one's items while the response arrived, which in a password manager means
 * showing credentials from the wrong context.
 */
export const queryKeys = {
  vaults: () => ['vaults'] as const,
  items: (vaultId: string) => ['vaults', vaultId, 'items'] as const,
} as const
