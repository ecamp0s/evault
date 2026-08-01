import { z } from 'zod'
import type { ContenidoDeItem } from '@/lib/vault/tipos'

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
 */

/*
 * Los topes existen para no acercarse al límite de la API, que rechaza un
 * ciphertext de más de 131072 caracteres. Como el blob es base64 sobre JSON, el
 * contenido real cabe con holgura dentro de estas cifras.
 */
const MAX_CORTO = 500
const MAX_NOTAS = 10000

export const esquemaItem = z.object({
  nombre: z.string().trim().min(1, 'Escribe un nombre').max(MAX_CORTO, 'Máximo 500 caracteres'),
  usuario: z.string().trim().max(MAX_CORTO, 'Máximo 500 caracteres'),
  password: z.string().max(MAX_CORTO, 'Máximo 500 caracteres'),
  /*
   * La URL no se valida como URL a propósito. Casi nadie escribe el esquema, y
   * rechazar «github.com» sería pelearse con el usuario por un campo que aquí solo
   * sirve para reconocer la entrada de un vistazo. Si algún día se usa para
   * autorrellenar, entonces sí habrá que normalizarla.
   */
  url: z.string().trim().max(MAX_CORTO, 'Máximo 500 caracteres'),
  notas: z.string().max(MAX_NOTAS, 'Máximo 10000 caracteres'),
})

export type DatosItem = z.infer<typeof esquemaItem>

export const ITEM_VACIO: DatosItem = {
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
export function aContenido(datos: DatosItem): ContenidoDeItem {
  const contenido: ContenidoDeItem = { nombre: datos.nombre.trim() }

  if (datos.usuario.trim()) contenido.usuario = datos.usuario.trim()
  if (datos.password) contenido.password = datos.password
  if (datos.url.trim()) contenido.url = datos.url.trim()
  if (datos.notas.trim()) contenido.notas = datos.notas

  return contenido
}

/** Del contenido guardado al formulario, para editar. */
export function aFormulario(contenido: ContenidoDeItem): DatosItem {
  return {
    nombre: contenido.nombre,
    usuario: contenido.usuario ?? '',
    password: contenido.password ?? '',
    url: contenido.url ?? '',
    notas: contenido.notas ?? '',
  }
}
