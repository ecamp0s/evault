import { openVaultKey } from '@/lib/vault/crypto'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { listVaults } from '@/lib/vault/api'

/**
 * Opening the vault with the master key.
 *
 * Signing in and unlocking the vault are two different things, and from ADR-007 on it
 * pays not to confuse them: the first says who you are and the second whether
 * anything can be decrypted. At login they happen back to back, but reloading the
 * page only needs the second, which is why this lives apart and not inside entrar().
 */

/**
 * The vault cannot be opened even though the credentials were right.
 *
 * A different failure from «wrong credentials», and the interface has to say it
 * differently, because what the user can do about it is not the same. With bad
 * credentials, they type them again; here, there is nothing to retype.
 */
export class VaultUnreachable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultInaccesible'
  }
}

/**
 * Fetches the wrapped key, opens it and leaves it in memory.
 *
 * Throws VaultInaccesible when there is no vault at all, and lets crypto.ts's
 * ErrorDeDescifrado through when the master key is not the one that wrapped this one:
 * two different causes, and the caller tells them apart.
 */
export async function unlockVault(masterKey: CryptoKey, token?: string): Promise<void> {
  const vaults = await listVaults(token)

  /*
   * The personal one, or the first if there were none. Today there is always exactly
   * one and the find is redundant, but writing it this way stops the day of the vault
   * picker from opening whichever comes first alphabetically.
   */
  const vault = vaults.find(({ is_personal }) => is_personal) ?? vaults[0]

  if (!vault) {
    /*
     * Should not happen: signing up creates the vault inside the same transaction as
     * the user. If it does, the account is broken, and saying so beats leaving the
     * application in a state where the item list never loads.
     */
    throw new VaultUnreachable('Esta cuenta no tiene ninguna vault')
  }

  const key = await openVaultKey(masterKey, {
    data: vault.wrapped_key,
    iv: vault.wrapped_key_iv,
  })

  useVaultKey.getState().save(key)
}
