import { api, interpretError } from '@/lib/api'
import { deriveKeys, deriveRecoveryKeys, rewrap, wrapVaultKeyForRecovery } from '@/lib/vault/crypto'
import { generateRecoveryKey, type GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'
import { listVaults } from '@/lib/vault/api'

/**
 * Cambiar el correo electrónico. Ver ADR-014.
 *
 * El correo NO es un dato de perfil: por ADR-008 es el salt del que se derivan la
 * clave maestra y las claves de recuperación. Cambiarlo re-deriva las dos, así que
 * esto se parece mucho más a rotar la contraseña que a editar un campo.
 *
 * Lo que NO cambia es la clave de vault, y por eso los items no se tocan: la
 * operación cuesta lo mismo con tres entradas que con tres mil.
 */

/**
 * Y LA ASIMETRÍA QUE SE VA A MALINTERPRETAR, porque es la inversa de la otra:
 *
 * - rotar la contraseña maestra NO invalida la clave de recuperación, porque la
 *   clave de vault no cambia y su envoltorio no se toca
 * - cambiar el correo SÍ la invalida, porque el correo es el salt del HKDF del que
 *   salen su clave de envoltura y su hash
 *
 * De ahí que esto devuelva una clave nueva cuando había una: dejar la vieja sería
 * dejar al usuario con una segunda llave que ya no abre y que él cree que abre, y
 * eso no se descubre hasta el día que hace falta.
 */
export async function changeEmail(
  currentEmail: string,
  newEmail: string,
  masterPassword: string,
  hasRecoveryKey: boolean,
): Promise<GeneratedRecoveryKey | null> {
  const current = await deriveKeys(masterPassword, currentEmail)
  const next = await deriveKeys(masterPassword, newEmail)

  const vaults = await listVaults()

  /*
   * TODO lo criptográfico ocurre antes de mandar la primera petición. Es el mismo
   * orden que salvó al cifrado de items en #59 y a la rotación en #125: si la
   * contraseña no fuera la correcta, rewrap lanza aquí y no se ha enviado nada, así
   * que no hay nada que deshacer.
   *
   * Y vale como comprobación de la contraseña, que es más fuerte que la del
   * servidor: el servidor valida identidad —que el hash coincide—, mientras que
   * abrir el envoltorio valida capacidad de descifrar.
   */
  const wrappedKeys = await Promise.all(
    vaults.map(async (vault) => {
      const rewrapped = await rewrap(
        current.masterKey,
        { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
        next.masterKey,
      )

      return {
        vault_id: vault.id,
        wrapped_key: rewrapped.data,
        wrapped_key_iv: rewrapped.iv,
      }
    }),
  )

  /*
   * La clave de recuperación nueva, solo para quien tenía una.
   *
   * A quien no la tenía no se le inventa una obligación que nunca tuvo: ADR-010
   * decidió que se ofrece y se puede rechazar, y quien la rechazó está en un estado
   * legítimo y permanente. Por eso hace falta saberlo, y por eso la API lo dice en
   * has_recovery_key: el cliente no puede deducirlo de ninguna otra cosa.
   */
  const generated = hasRecoveryKey ? generateRecoveryKey() : null
  let recovery: { authHash: string; wrappedKeys: unknown[] } | null = null

  if (generated) {
    const derived = await deriveRecoveryKeys(generated.bytes, newEmail)

    recovery = {
      authHash: derived.authHash,
      wrappedKeys: await Promise.all(
        vaults.map(async (vault) => {
          const wrapped = await wrapVaultKeyForRecovery(
            current.masterKey,
            { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
            derived.wrapKey,
          )

          return {
            vault_id: vault.id,
            recovery_wrapped_key: wrapped.data,
            recovery_wrapped_key_iv: wrapped.iv,
          }
        }),
      ),
    }
  }

  try {
    await api.put('/auth/email', {
      email: newEmail,
      current_password: current.authHash,
      password: next.authHash,
      wrapped_keys: wrappedKeys,
      recovery_auth_hash: recovery?.authHash ?? null,
      recovery_wrapped_keys: recovery?.wrappedKeys ?? [],
    })
  } catch (error) {
    throw interpretError(error)
  }

  return generated
}
