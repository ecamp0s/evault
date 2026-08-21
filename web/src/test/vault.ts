import { pack } from '@/lib/vault/payload'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import type { ItemContent, EncryptedItem } from '@/lib/vault/types'

/**
 * Helpers for the tests that need an unlocked vault.
 *
 * Since encryption became real, any test that paints items has to have a key in memory
 * and build its fixtures by really encrypting them. Doing it by hand in every file
 * would repeat the same plumbing with different criteria.
 */

/**
 * A usable vault key, without going through PBKDF2.
 *
 * 32 bytes are imported directly instead of being derived from a password because
 * deriving costs 600,000 iterations on purpose, and these tests do not check the
 * derivation: that has tests of its own in crypto.test.ts. What is needed here is a key
 * that encrypts and decrypts, not one that comes from any particular place.
 */
export async function testKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/** Leaves the vault unlocked and returns the key it was opened with. */
export async function unlockForTest(): Promise<CryptoKey> {
  const vaultKey = await testKey()

  useVaultKey.setState({ key: vaultKey })

  return vaultKey
}

/** An item as the API would return it, with its content really encrypted. */
export async function encryptedItem(
  vaultKey: CryptoKey,
  id: string,
  content: ItemContent,
  vaultId = 'vault-1',
): Promise<EncryptedItem> {
  return {
    id,
    vault_id: vaultId,
    ...(await pack(vaultKey, content)),
    created_at: null,
    updated_at: null,
  }
}
