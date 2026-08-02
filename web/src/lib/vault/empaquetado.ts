import type { ContenidoDeItem, ItemCifrado, PayloadDeItem } from '@/lib/vault/tipos'
import { VERSION_CIFRADO, cifrar, descifrar } from '@/lib/vault/cripto'

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
const ILEGIBLE: ContenidoDeItem = { nombre: 'No se puede leer esta entrada' }

/** Cifra el contenido de un item para mandarlo a la API. */
export async function empaquetar(
  clave: CryptoKey,
  contenido: ContenidoDeItem,
): Promise<PayloadDeItem> {
  const { datos, iv } = await cifrar(clave, JSON.stringify(contenido))

  return { ciphertext: datos, iv, version: VERSION_CIFRADO }
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
export async function desempaquetar(
  clave: CryptoKey,
  item: ItemCifrado,
): Promise<ContenidoDeItem> {
  /*
   * La versión se mira antes de intentar nada. Un item de la versión 1 se
   * descifraría a basura con cualquier clave, porque nunca estuvo cifrado, y AES-GCM
   * no lo rechazaría por la etiqueta: simplemente no es texto cifrado.
   */
  if (item.version !== VERSION_CIFRADO) {
    return ILEGIBLE
  }

  try {
    const contenido: unknown = JSON.parse(
      await descifrar(clave, { datos: item.ciphertext, iv: item.iv }),
    )

    if (typeof contenido !== 'object' || contenido === null) {
      return ILEGIBLE
    }

    const { nombre, ...resto } = contenido as ContenidoDeItem

    return { nombre: typeof nombre === 'string' ? nombre : 'Sin nombre', ...resto }
  } catch {
    return ILEGIBLE
  }
}
