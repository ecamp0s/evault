import { api, interpretError } from '@/lib/api'
import { deriveKeys, rewrap } from '@/lib/vault/crypto'
import { listVaults } from '@/lib/vault/api'

/**
 * Cambiar la contraseña maestra. Ver ADR-008.
 *
 * Es donde se cobra el dividendo de aquella decisión: la clave de vault no cambia,
 * solo se reenvuelve. Los items no se tocan, así que la operación es igual de rápida
 * con tres entradas que con tres mil, y no puede dejar la vault a medias.
 */
export async function changeMasterPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const actual = await deriveKeys(currentPassword, email)
  const nueva = await deriveKeys(newPassword, email)

  const vaults = await listVaults()

  /*
   * El reenvolvido ocurre ENTERO antes de mandar nada. Es el mismo orden que salvó
   * al cifrado de items en #59: cifrar primero, pedir después. Si la contraseña
   * actual no fuera la correcta, rewrap lanza aquí y no se ha enviado ni una
   * petición, así que no hay nada que deshacer.
   *
   * Y por eso esto vale como comprobación de la contraseña actual: no basta con que
   * el servidor acepte el hash, porque el servidor valida identidad y no capacidad
   * de descifrar. Lo que demuestra que la contraseña es la buena es que abra el
   * envoltorio.
   */
  const wrappedKeys = await Promise.all(
    vaults.map(async (vault) => {
      const reenvuelta = await rewrap(
        actual.masterKey,
        { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
        nueva.masterKey,
      )

      return {
        vault_id: vault.id,
        wrapped_key: reenvuelta.data,
        wrapped_key_iv: reenvuelta.iv,
      }
    }),
  )

  try {
    await api.put('/auth/master-password', {
      current_password: actual.authHash,
      password: nueva.authHash,
      wrapped_keys: wrappedKeys,
    })
  } catch (error) {
    throw interpretError(error)
  }
}
