import { z } from 'zod'
import type { ItemContent } from '@/lib/vault/types'

/**
 * Validación de una entrada de la vault.
 *
 * **Esta validación es la única que hay, y es una excepción real al double guard
 * del proyecto, no un descuido.** Los cinco campos van dentro del blob, así que el
 * servidor no puede verlos ni validarlos: lo único que comprueba es el tamaño del
 * bulto. Donde el patrón dice «valida la interfaz y valida también la aplicación»,
 * aquí la segunda mitad es imposible por diseño. Ver ADR-001.
 *
 * Consecuencia práctica: lo que no se compruebe aquí no lo comprueba nadie.
 *
 * Los nombres de los campos siguen en español porque espejan los del blob, y los
 * del blob son formato de datos y no identificadores: ver el aviso en types.ts.
 * Tenerlos iguales a los dos lados es lo que hace que toContent y toFormData sean
 * una traducción trivial y no un mapeo que haya que ir mirando.
 */

/*
 * Los topes existen para no acercarse al límite de la API, que rechaza un
 * ciphertext de más de 131072 caracteres. Como el blob es base64 sobre JSON, el
 * contenido real cabe con holgura dentro de estas cifras.
 */
// Se exportan porque el import los necesita: lo que no valide el cliente no lo
// valida nadie, y un import masivo es la prueba de esfuerzo de esa excepción.
export const MAX_SHORT = 500
export const MAX_NOTES = 10000

export const itemSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe un nombre').max(MAX_SHORT, 'Máximo 500 caracteres'),
  usuario: z.string().trim().max(MAX_SHORT, 'Máximo 500 caracteres'),
  password: z.string().max(MAX_SHORT, 'Máximo 500 caracteres'),
  /*
   * La URL no se valida como URL a propósito. Casi nadie escribe el esquema, y
   * rechazar «github.com» sería pelearse con el usuario por un campo que aquí solo
   * sirve para reconocer la entrada de un vistazo. Si algún día se usa para
   * autorrellenar, entonces sí habrá que normalizarla.
   */
  url: z.string().trim().max(MAX_SHORT, 'Máximo 500 caracteres'),
  notas: z.string().max(MAX_NOTES, 'Máximo 10000 caracteres'),
})

export type ItemFormData = z.infer<typeof itemSchema>

export const EMPTY_ITEM: ItemFormData = {
  nombre: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
}

/**
 * Del formulario al contenido que se guarda.
 *
 * Los campos vacíos se omiten en vez de guardarse como cadena vacía: el contrato
 * del blob dice claves ausentes para lo que no se ha rellenado, y así el blob no
 * engorda con nada. Ver docs/architecture/FOUNDATION.md.
 */
export function toContent(data: ItemFormData): ItemContent {
  const content: ItemContent = { nombre: data.nombre.trim() }

  if (data.usuario.trim()) content.usuario = data.usuario.trim()
  if (data.password) content.password = data.password
  if (data.url.trim()) content.url = data.url.trim()
  if (data.notas.trim()) content.notas = data.notas

  return content
}

/** Del contenido guardado al formulario, para editar. */
export function toFormData(content: ItemContent): ItemFormData {
  return {
    nombre: content.nombre,
    usuario: content.usuario ?? '',
    password: content.password ?? '',
    url: content.url ?? '',
    notas: content.notas ?? '',
  }
}
