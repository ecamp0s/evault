import type { ItemContent, EncryptedItem, ItemPayload } from '@/lib/vault/types'
import { CIPHER_VERSION, encrypt, decrypt } from '@/lib/vault/crypto'

/**
 * La frontera del blob: de contenido legible a lo que viaja a la API, y de vuelta.
 *
 * Sustituye a sinCifrar.ts, que durante la Iteración 2 hacía esto mismo con base64
 * y sin criptografía. Aquel fichero llevaba el aviso de que no cifraba nada; este
 * ya no lo necesita, porque cifra de verdad con AES-256-GCM y una clave que el
 * servidor no tiene. Es el único punto del cliente que se tuvo que tocar para pasar
 * de lo uno a lo otro, que era la promesa del issue #54 y se ha cumplido.
 *
 * La clave llega por parámetro y no se busca aquí dentro. Es el mismo principio que
 * ADR-004 aplica al contexto de vault en el servidor: quien llama dice con qué
 * clave, de modo que no existe la posibilidad de descifrar «con la que haya».
 *
 * Ver ADR-001, ADR-008 y docs/architecture/FOUNDATION.md.
 */

/**
 * Lo que se enseña cuando una entrada no se puede leer.
 *
 * Perder una fila es malo; perder la pantalla entera por una fila es peor. Pasa con
 * un item escrito por un cliente más nuevo, con uno cifrado con otra contraseña
 * maestra, y con los que quedaran de la codificación anterior.
 */
export const UNREADABLE: ItemContent = { nombre: 'No se puede leer esta entrada' }

/**
 * Si un contenido es el marcador de arriba y no algo que el usuario escribió.
 *
 * Existe para que quien necesite contarlos —el export, que no puede llevarse por
 * delante una copia de seguridad sin avisar— no tenga que comparar el texto a mano.
 *
 * Compara por IDENTIDAD y no por valor, que es más estricto de lo que parece
 * necesario y es a propósito: comparando el texto, un item que el usuario hubiera
 * llamado «No se puede leer esta entrada» quedaría fuera de su propia copia de
 * seguridad sin que nadie se enterara. Aquí solo es ilegible lo que salió de este
 * módulo siéndolo. Por eso el marcador se exporta: quien lo pruebe tiene que usar
 * este mismo objeto, no uno que se le parezca.
 */
export function isUnreadable(content: ItemContent): boolean {
  return content === UNREADABLE
}

/** Cifra el contenido de un item para mandarlo a la API. */
export async function pack(
  key: CryptoKey,
  content: ItemContent,
): Promise<ItemPayload> {
  const { data, iv } = await encrypt(key, JSON.stringify(content))

  return { ciphertext: data, iv, version: CIPHER_VERSION }
}

/**
 * Descifra un item que viene de la API.
 *
 * No propaga el fallo, y aquí es lo correcto aunque en cripto.ts sea al revés: esto
 * se llama una vez por fila al pintar la lista, y una entrada rota no puede impedir
 * ver las demás. Lo que **sí** propaga sus errores es empaquetar, porque ahí un
 * fallo silencioso escribiría basura encima de datos buenos.
 *
 * La asimetría es deliberada: leer mal una fila se ve y se puede investigar;
 * escribir mal una fila no se ve hasta que hace falta, y entonces ya no hay nada
 * que hacer.
 */
export async function unpack(
  key: CryptoKey,
  item: EncryptedItem,
): Promise<ItemContent> {
  /*
   * La versión se mira antes de intentar nada. Un item de la versión 1 se
   * descifraría a basura con cualquier clave, porque nunca estuvo cifrado, y AES-GCM
   * no lo rechazaría por la etiqueta: simplemente no es texto cifrado.
   */
  if (item.version !== CIPHER_VERSION) {
    return UNREADABLE
  }

  try {
    const content: unknown = JSON.parse(
      await decrypt(key, { data: item.ciphertext, iv: item.iv }),
    )

    if (typeof content !== 'object' || content === null) {
      return UNREADABLE
    }

    const { nombre, ...rest } = content as ItemContent

    return { nombre: typeof nombre === 'string' ? nombre : 'Sin nombre', ...rest }
  } catch {
    return UNREADABLE
  }
}
