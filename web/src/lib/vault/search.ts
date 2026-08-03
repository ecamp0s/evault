import type { Item } from '@/lib/vault/tipos'

/**
 * Búsqueda de items, en el cliente y solo en el cliente.
 *
 * No es una simplificación ni una primera versión que ya se mejorará: **el servidor
 * no puede filtrar lo que no puede leer**. Los items llegan cifrados y se descifran
 * en memoria, así que el único sitio del sistema donde existe algo que buscar es
 * este. Está en ADR-001 como consecuencia asumida y en FOUNDATION.md entre las
 * consecuencias para quien escriba código.
 *
 * Conviene que quede dicho aquí, y no solo en la documentación: alguien que llegue
 * después y vea un filtro en cliente pensará en moverlo al servidor con la mejor
 * intención, y hay que ahorrarle el camino. Mover esto al servidor significaría
 * mandarle el contenido en claro, es decir, dejar de ser un producto zero-knowledge.
 */

/**
 * Pasa un texto a minúsculas y le quita las marcas diacríticas.
 *
 * Buscar «cafe» tiene que encontrar «Café». La descomposición NFD separa la letra de
 * su tilde y el reemplazo se lleva la tilde, que es la forma estándar de hacerlo sin
 * mantener una tabla de equivalencias a mano.
 *
 * **La ñ también pierde la tilde**, y eso es una decisión y no un descuido. En
 * español la ñ es una letra propia, así que lo correcto al ordenar o al comparar
 * sería conservarla; pero esto es una búsqueda, y aquí las prioridades se invierten.
 * Quien escribe «espanol» —con un teclado sin ñ, o por prisa— espera encontrar
 * «Español», y no encontrarlo parece que la entrada no existe. El precio es que
 * «ano» encuentra también «año»: un resultado de más, que se descarta de un vistazo.
 *
 * La regla de fondo: en una búsqueda, un falso positivo molesta y un falso negativo
 * esconde. Ante la duda, permisivo.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Los campos por los que se busca.
 *
 * La contraseña **no** está, y es deliberado: buscar por ella obligaría a teclear un
 * secreto en un campo visible en claro, que además queda en el historial del
 * formulario. Las notas sí, porque es donde acaba el «la cuenta del trabajo» que
 * distingue dos entradas del mismo servicio.
 */
function searchableText(item: Item): string {
  const { nombre, usuario, url, notas } = item.contenido

  return [nombre, usuario, url, notas].filter(Boolean).join(' ')
}

/**
 * Filtra los items que coinciden con lo escrito.
 *
 * Todas las palabras tienen que aparecer, en cualquier campo y en cualquier orden:
 * quien escribe «github ada» espera la entrada de GitHub de Ada, no todas las que
 * contengan una cosa u otra. Es lo que distingue una búsqueda útil de una que
 * devuelve media vault.
 */
export function filterItems(items: Item[], query: string): Item[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)

  if (terms.length === 0) {
    return items
  }

  return items.filter((item) => {
    const text = normalize(searchableText(item))

    return terms.every((term) => text.includes(term))
  })
}
