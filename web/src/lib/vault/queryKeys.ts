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
  /*
   * No vaultId here, unlike the two above, and it is not an oversight: a passkey belongs
   * to the account and not to one vault. The row carries a vault_id today because there
   * is one vault to wrap, but what the screen lists is «the ways I can get in».
   */
  passkeys: () => ['passkeys'] as const,
} as const
