import { beforeAll, describe, expect, it } from 'vitest'
import { desempaquetar, empaquetar } from './empaquetado'
import { VERSION_CIFRADO } from './cripto'
import { claveDePrueba } from '@/test/vault'
import type { ContenidoDeItem, ItemCifrado } from './tipos'

/*
 * Sustituye a sinCifrar.test.ts. Los casos son casi los mismos porque el contrato
 * no ha cambiado —era la promesa del issue #54 y se ha cumplido—, pero hay dos
 * diferencias que importan: el contenido ya no se puede leer sin la clave, y la
 * versión que se escribe es la 2.
 */

let clave: CryptoKey
let otraClave: CryptoKey

beforeAll(async () => {
  clave = await claveDePrueba()

  otraClave = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(7),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
})

/** Un item como lo devolvería la API, envolviendo el payload dado. */
function itemCon(payload: { ciphertext: string; iv: string; version: number }): ItemCifrado {
  return {
    id: 'item-1',
    vault_id: 'vault-1',
    ...payload,
    created_at: null,
    updated_at: null,
  }
}

async function ida(contenido: ContenidoDeItem): Promise<ContenidoDeItem> {
  return desempaquetar(clave, itemCon(await empaquetar(clave, contenido)))
}

describe('empaquetar y desempaquetar', () => {
  it('el ciclo completo devuelve el mismo contenido', async () => {
    const contenido: ContenidoDeItem = {
      nombre: 'GitHub',
      usuario: 'ada@example.com',
      password: 'una-contraseña-larga',
      url: 'https://github.com',
      notas: 'la de la cuenta vieja',
    }

    expect(await ida(contenido)).toEqual(contenido)
  })

  it('conserva los campos que no se han rellenado', async () => {
    expect(await ida({ nombre: 'Solo el nombre' })).toEqual({ nombre: 'Solo el nombre' })
  })

  /*
   * La lección de btoa de la Iteración 2, que sigue valiendo con el cifrado real
   * porque el JSON se pasa a bytes por UTF-8 antes de cifrarlo.
   */
  it('sobrevive a acentos, emoji y alfabetos no latinos', async () => {
    const contenido: ContenidoDeItem = {
      nombre: 'Correo del año 漢字',
      usuario: 'añoñó@example.com',
      password: 'çontraseña-🔐-ñ',
      notas: 'Ω≈ç√∫˜µ',
    }

    expect(await ida(contenido)).toEqual(contenido)
  })

  it('sobrevive a comillas, saltos de línea y llaves', async () => {
    const contenido: ContenidoDeItem = {
      nombre: 'Con "comillas" y \'apóstrofes\'',
      notas: 'linea 1\nlinea 2\t{"json":"falso"}',
    }

    expect(await ida(contenido)).toEqual(contenido)
  })

  it('marca el payload con la versión del cifrado real', async () => {
    const payload = await empaquetar(clave, { nombre: 'X' })

    expect(payload.version).toBe(VERSION_CIFRADO)
    expect(payload.version).toBe(2)
  })

  /*
   * El reverso exacto del test que en la Iteración 2 comprobaba lo contrario:
   * «hoy el contenido es legible sin ninguna clave, que es justo la deuda». Ese
   * test avisaba de que su día llegaría, y este es el día.
   */
  it('el contenido ya no se puede leer sin la clave', async () => {
    const payload = await empaquetar(clave, { nombre: 'GitHub', password: 'secreto' })

    expect(atob(payload.ciphertext)).not.toContain('secreto')
    expect(atob(payload.ciphertext)).not.toContain('GitHub')
  })

  it('dos guardados del mismo contenido no producen el mismo payload', async () => {
    const primero = await empaquetar(clave, { nombre: 'GitHub' })
    const segundo = await empaquetar(clave, { nombre: 'GitHub' })

    expect(primero.ciphertext).not.toBe(segundo.ciphertext)
    expect(primero.iv).not.toBe(segundo.iv)
  })
})

describe('desempaquetar ante datos que no puede leer', () => {
  /*
   * Que devuelva un marcador y no lance es deliberado, y es la asimetría que separa
   * este módulo de cripto.ts: se llama una vez por fila al pintar la lista, y una
   * entrada rota no puede impedir ver las demás.
   */
  it('no revienta con una versión de esquema desconocida', async () => {
    const item = itemCon({ ciphertext: 'lo-que-sea', iv: 'x', version: 99 })

    expect((await desempaquetar(clave, item)).nombre).toBe('No se puede leer esta entrada')
  })

  /*
   * Los items que quedaran de la Iteración 2. Nunca estuvieron cifrados, así que
   * ninguna clave los abre; la versión se mira antes de intentarlo para no
   * descifrarlos a basura, que es lo que haría AES-GCM sin quejarse de la etiqueta.
   */
  it('no intenta descifrar un item de la codificación anterior', async () => {
    const item = itemCon({ ciphertext: btoa('{"nombre":"GitHub"}'), iv: 'sin-cifrar', version: 1 })

    expect((await desempaquetar(clave, item)).nombre).toBe('No se puede leer esta entrada')
  })

  /*
   * El caso de otra contraseña maestra. Aquí la etiqueta de GCM sí hace su trabajo:
   * el descifrado falla en vez de devolver bytes cualesquiera.
   */
  it('no revienta con un item cifrado con otra clave', async () => {
    const item = itemCon(await empaquetar(otraClave, { nombre: 'De otra persona' }))

    expect((await desempaquetar(clave, item)).nombre).toBe('No se puede leer esta entrada')
  })

  it('no revienta con un ciphertext manipulado', async () => {
    const payload = await empaquetar(clave, { nombre: 'GitHub' })

    // Otro carácter, no uno fijo: si el original ya empezaba por A, no cambiaría nada.
    const manipulado = (payload.ciphertext[0] === 'A' ? 'B' : 'A') + payload.ciphertext.slice(1)

    expect(
      (await desempaquetar(clave, itemCon({ ...payload, ciphertext: manipulado }))).nombre,
    ).toBe('No se puede leer esta entrada')
  })

  it('no revienta con un ciphertext que no es base64', async () => {
    const item = itemCon({ ciphertext: '!!!no-base64!!!', iv: 'x', version: VERSION_CIFRADO })

    expect((await desempaquetar(clave, item)).nombre).toBe('No se puede leer esta entrada')
  })

  it('pone un nombre de relleno si el objeto descifrado no trae ninguno', async () => {
    const payload = await empaquetar(clave, { password: 'x' } as ContenidoDeItem)

    expect((await desempaquetar(clave, itemCon(payload))).nombre).toBe('Sin nombre')
  })
})
