import { openVaultKey } from '@/lib/vault/crypto'
import { useVaultKey } from '@/lib/vault/keyInMemory'
import { listVaults } from '@/lib/vault/api'

/**
 * Abrir la vault con la clave maestra.
 *
 * Iniciar sesión y desbloquear la vault son dos cosas distintas, y a partir de
 * ADR-007 conviene no confundirlas: la primera dice quién eres y la segunda si se
 * puede descifrar algo. En el login ocurren seguidas, pero al recargar la página
 * solo hará falta la segunda, y por eso esto vive aparte y no dentro de entrar().
 */

/**
 * La vault no se puede abrir aunque las credenciales fueran correctas.
 *
 * Es un fallo distinto de «credenciales incorrectas» y la interfaz tiene que
 * decirlo distinto, porque lo que puede hacer el usuario no es lo mismo. Con
 * credenciales malas, vuelve a escribirlas; aquí, no hay nada que reescribir.
 */
export class VaultUnreachable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultInaccesible'
  }
}

/**
 * Recupera la clave envuelta, la abre y la deja en memoria.
 *
 * Lanza VaultInaccesible si no hay ninguna vault, y deja pasar el ErrorDeDescifrado
 * de crypto.ts si la clave maestra no es la que envolvió esta: son dos causas
 * distintas y quien llama las distingue.
 */
export async function unlockVault(masterKey: CryptoKey, token?: string): Promise<void> {
  const vaults = await listVaults(token)

  /*
   * La personal, y si no hubiera, la primera. Hoy siempre hay exactamente una y el
   * find sobra, pero escribirlo así evita que el día del selector de vaults esto
   * empiece a abrir la que toque por orden alfabético.
   */
  const vault = vaults.find(({ is_personal }) => is_personal) ?? vaults[0]

  if (!vault) {
    /*
     * No debería ocurrir: el alta crea la vault dentro de la misma transacción que
     * el usuario. Si pasa, es una cuenta rota, y decirlo es mejor que dejar la
     * aplicación en un estado en el que la lista de items no carga nunca.
     */
    throw new VaultUnreachable('Esta cuenta no tiene ninguna vault')
  }

  const key = await openVaultKey(masterKey, {
    data: vault.wrapped_key,
    iv: vault.wrapped_key_iv,
  })

  useVaultKey.getState().save(key)
}
