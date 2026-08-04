import { api, interpretError } from '@/lib/api'
import {
  deriveKeys,
  deriveRecoveryKeys,
  rewrapForMasterKey,
  wrapVaultKeyForRecovery,
} from '@/lib/vault/crypto'
import { generateRecoveryKey, type GeneratedRecoveryKey } from '@/lib/vault/recoveryKey'
import { listVaults } from '@/lib/vault/api'

/** Lo que devuelve el endpoint de recuperación por cada vault. */
interface RecoveryWrappedKey {
  vault_id: string
  recovery_wrapped_key: string
  recovery_wrapped_key_iv: string
}

/**
 * Generar la clave de recuperación y registrarla. Ver ADR-010.
 *
 * Todo lo que importa ocurre aquí en el cliente: el secreto se genera en este
 * dispositivo, envuelve la clave de vault en este dispositivo, y al servidor solo
 * viajan un blob que no puede abrir y un hash del que no puede volver.
 *
 * Pide la contraseña maestra en vez de usar la clave de vault que ya está en
 * memoria, y no es un descuido. La clave de vault se importa como NO extraíble, así
 * que su material no se puede volver a leer para envolverlo otra vez; lo que sí se
 * puede es abrir el envoltorio que ya existe, y eso necesita la clave maestra.
 *
 * El efecto secundario es bueno: crear una segunda llave a la vault pasa a exigir
 * la contraseña, que es lo que uno espera de una operación así.
 */
export async function createRecoveryKey(
  email: string,
  masterPassword: string,
): Promise<GeneratedRecoveryKey> {
  const { masterKey } = await deriveKeys(masterPassword, email)
  const generated = generateRecoveryKey()
  const { wrapKey, authHash } = await deriveRecoveryKeys(generated.bytes, email)

  /*
   * Se reenvuelve la clave de CADA vault. Hoy siempre hay una, pero el envoltorio
   * es por miembro y por vault desde ADR-008, y una vault sin envoltorio de
   * recuperación es una vault que la clave no abriría el día que hiciera falta.
   */
  const vaults = await listVaults()

  const wrappedKeys = await Promise.all(
    vaults.map(async (vault) => {
      const wrapped = await wrapVaultKeyForRecovery(
        masterKey,
        { data: vault.wrapped_key, iv: vault.wrapped_key_iv },
        wrapKey,
      )

      return {
        vault_id: vault.id,
        recovery_wrapped_key: wrapped.data,
        recovery_wrapped_key_iv: wrapped.iv,
      }
    }),
  )

  /*
   * El envío va después de que todo lo criptográfico haya salido bien. Es el mismo
   * orden que salvó al cifrado de items en #59: cifrar primero, pedir después. Si
   * la contraseña maestra fuera incorrecta, wrapVaultKeyForRecovery lanza y no se
   * ha mandado nada.
   */
  try {
    await api.post('/auth/recovery-key', {
      recovery_auth_hash: authHash,
      wrapped_keys: wrappedKeys,
    })
  } catch (error) {
    throw interpretError(error)
  }

  return generated
}

/**
 * Recupera el acceso con la clave de recuperación y fija una contraseña nueva.
 *
 * Es el camino completo de ADR-010 y no se puede partir: quien termina aquí entra
 * con una contraseña maestra que acaba de elegir. Dejarlo a medias —dentro pero sin
 * contraseña utilizable— sería dejar la cuenta colgando del papel.
 *
 * Nada de esto pasa por el servidor salvo los blobs: el envoltorio se abre en este
 * dispositivo y la clave de vault no sale de aquí en claro en ningún momento.
 */
export async function recoverAccess(
  email: string,
  recoveryKeyBytes: Uint8Array<ArrayBuffer>,
  newMasterPassword: string,
): Promise<void> {
  const { wrapKey, authHash } = await deriveRecoveryKeys(recoveryKeyBytes, email)

  let respuesta: { wrapped_keys: RecoveryWrappedKey[]; token: string }

  try {
    const { data } = await api.post<{ data: { wrapped_keys: RecoveryWrappedKey[]; token: string } }>(
      '/auth/recover',
      { email, recovery_auth_hash: authHash },
    )

    respuesta = data.data
  } catch (error) {
    throw interpretError(error)
  }

  /*
   * A partir de aquí ya no es un problema de credenciales: el servidor ha dicho que
   * la clave es la correcta. Si el envoltorio no abre, es otra cosa, y la interfaz
   * tiene que decirlo distinto. Es la misma distinción que la Iteración 3 hizo entre
   * «credenciales incorrectas» y «no se puede abrir la vault».
   */
  const { masterKey, authHash: newAuthHash } = await deriveKeys(newMasterPassword, email)

  const wrappedKeys = await Promise.all(
    respuesta.wrapped_keys.map(async (entrada) => {
      const rewrapped = await rewrapForMasterKey(
        wrapKey,
        { data: entrada.recovery_wrapped_key, iv: entrada.recovery_wrapped_key_iv },
        masterKey,
      )

      return {
        vault_id: entrada.vault_id,
        wrapped_key: rewrapped.data,
        wrapped_key_iv: rewrapped.iv,
      }
    }),
  )

  try {
    await api.post(
      '/auth/recover/complete',
      { password: newAuthHash, wrapped_keys: wrappedKeys },
      { headers: { Authorization: `Bearer ${respuesta.token}` } },
    )
  } catch (error) {
    throw interpretError(error)
  }
}
