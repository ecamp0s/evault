import { empaquetar } from '@/lib/vault/empaquetado'
import { useClaveDeVault } from '@/lib/vault/claveEnMemoria'
import type { ContenidoDeItem, ItemCifrado } from '@/lib/vault/tipos'

/**
 * Utilidades para los tests que necesitan una vault desbloqueada.
 *
 * Desde el cifrado real, cualquier test que pinte items tiene que tener una clave
 * en memoria y construir sus fixtures cifrándolos de verdad. Hacerlo a mano en cada
 * fichero repetiría la misma fontanería con criterios distintos.
 */

/**
 * Una clave de vault utilizable, sin pasar por PBKDF2.
 *
 * Se importan 32 bytes directamente en vez de derivarlos de una contraseña porque
 * derivar cuesta 600.000 iteraciones a propósito, y estos tests no comprueban la
 * derivación: eso tiene sus propios tests en cripto.test.ts. Aquí lo que se necesita
 * es una clave que cifre y descifre, no una que venga de ningún sitio concreto.
 */
export async function claveDePrueba(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/** Deja la vault desbloqueada y devuelve la clave con la que se abrió. */
export async function desbloquearParaTest(): Promise<CryptoKey> {
  const clave = await claveDePrueba()

  useClaveDeVault.setState({ clave })

  return clave
}

/** Un item como lo devolvería la API, con su contenido cifrado de verdad. */
export async function itemCifrado(
  clave: CryptoKey,
  id: string,
  contenido: ContenidoDeItem,
  vaultId = 'vault-1',
): Promise<ItemCifrado> {
  return {
    id,
    vault_id: vaultId,
    ...(await empaquetar(clave, contenido)),
    created_at: null,
    updated_at: null,
  }
}
