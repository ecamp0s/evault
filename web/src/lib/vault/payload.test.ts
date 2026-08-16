import { beforeAll, describe, expect, it } from 'vitest'
import { unpack, pack } from './payload'
import { CIPHER_VERSION } from './crypto'
import { testKey } from '@/test/vault'
import type { ItemContent, EncryptedItem } from './types'

/*
 * Sustituye a sinCifrar.test.ts. Los casos son casi los mismos porque el contrato
 * no ha cambiado —era la promesa del issue #54 y se ha cumplido—, pero hay dos
 * diferencias que importan: el contenido ya no se puede leer sin la clave, y la
 * versión que se escribe es la 2.
 */

let key: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  key = await testKey()

  otherKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(7),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
})

/** Un item como lo devolvería la API, envolviendo el payload dado. */
function itemWith(payload: { ciphertext: string; iv: string; version: number }): EncryptedItem {
  return {
    id: 'item-1',
    vault_id: 'vault-1',
    ...payload,
    created_at: null,
    updated_at: null,
  }
}

async function roundTrip(content: ItemContent): Promise<ItemContent> {
  return unpack(key, itemWith(await pack(key, content)))
}

describe('empaquetar y desempaquetar', () => {
  it('el ciclo completo devuelve el mismo contenido', async () => {
    const content: ItemContent = {
      nombre: 'GitHub',
      usuario: 'ada@example.com',
      password: 'una-contraseña-larga',
      url: 'https://github.com',
      notas: 'la de la cuenta vieja',
    }

    expect(await roundTrip(content)).toEqual(content)
  })

  it('conserva los campos que no se han rellenado', async () => {
    expect(await roundTrip({ nombre: 'Solo el nombre' })).toEqual({ nombre: 'Solo el nombre' })
  })

  /*
   * La lección de btoa de la Iteración 2, que sigue valiendo con el cifrado real
   * porque el JSON se pasa a bytes por UTF-8 antes de cifrarlo.
   */
  it('sobrevive a acentos, emoji y alfabetos no latinos', async () => {
    const content: ItemContent = {
      nombre: 'Correo del año 漢字',
      usuario: 'añoñó@example.com',
      password: 'çontraseña-🔐-ñ',
      notas: 'Ω≈ç√∫˜µ',
    }

    expect(await roundTrip(content)).toEqual(content)
  })

  it('sobrevive a comillas, saltos de línea y llaves', async () => {
    const content: ItemContent = {
      nombre: 'Con "comillas" y \'apóstrofes\'',
      notas: 'linea 1\nlinea 2\t{"json":"falso"}',
    }

    expect(await roundTrip(content)).toEqual(content)
  })

  it('marca el payload con la versión del cifrado real', async () => {
    const payload = await pack(key, { nombre: 'X' })

    expect(payload.version).toBe(CIPHER_VERSION)
    expect(payload.version).toBe(2)
  })

  /*
   * El reverso exacto del test que en la Iteración 2 comprobaba lo contrario:
   * «hoy el contenido es legible sin ninguna clave, que es justo la deuda». Ese
   * test avisaba de que su día llegaría, y este es el día.
   */
  it('el contenido ya no se puede leer sin la clave', async () => {
    const payload = await pack(key, { nombre: 'GitHub', password: 'secreto' })

    expect(atob(payload.ciphertext)).not.toContain('secreto')
    expect(atob(payload.ciphertext)).not.toContain('GitHub')
  })

  it('dos guardados del mismo contenido no producen el mismo payload', async () => {
    const firstOne = await pack(key, { nombre: 'GitHub' })
    const secondOne = await pack(key, { nombre: 'GitHub' })

    expect(firstOne.ciphertext).not.toBe(secondOne.ciphertext)
    expect(firstOne.iv).not.toBe(secondOne.iv)
  })
})

describe('desempaquetar ante datos que no puede leer', () => {
  /*
   * Que devuelva un marcador y no lance es deliberado, y es la asimetría que separa
   * este módulo de crypto.ts: se llama una vez por fila al pintar la lista, y una
   * entrada rota no puede impedir ver las demás.
   */
  it('no revienta con una versión de esquema desconocida', async () => {
    const item = itemWith({ ciphertext: 'lo-que-sea', iv: 'x', version: 99 })

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  /*
   * Los items que quedaran de la Iteración 2. Nunca estuvieron cifrados, así que
   * ninguna clave los abre; la versión se mira antes de intentarlo para no
   * descifrarlos a basura, que es lo que haría AES-GCM sin quejarse de la etiqueta.
   */
  it('no intenta descifrar un item de la codificación anterior', async () => {
    const item = itemWith({ ciphertext: btoa('{"nombre":"GitHub"}'), iv: 'sin-cifrar', version: 1 })

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  /*
   * El caso de otra contraseña maestra. Aquí la etiqueta de GCM sí hace su trabajo:
   * el descifrado falla en vez de devolver bytes cualesquiera.
   */
  it('no revienta con un item cifrado con otra clave', async () => {
    const item = itemWith(await pack(otherKey, { nombre: 'De otra persona' }))

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  it('no revienta con un ciphertext manipulado', async () => {
    const payload = await pack(key, { nombre: 'GitHub' })

    // Otro carácter, no uno fijo: si el original ya empezaba por A, no cambiaría nada.
    const tampered = (payload.ciphertext[0] === 'A' ? 'B' : 'A') + payload.ciphertext.slice(1)

    expect(
      (await unpack(key, itemWith({ ...payload, ciphertext: tampered }))).nombre,
    ).toBe('No se puede leer esta entrada')
  })

  it('no revienta con un ciphertext que no es base64', async () => {
    const item = itemWith({ ciphertext: '!!!no-base64!!!', iv: 'x', version: CIPHER_VERSION })

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  it('pone un nombre de relleno si el objeto descifrado no trae ninguno', async () => {
    const payload = await pack(key, { password: 'x' } as ItemContent)

    expect((await unpack(key, itemWith(payload))).nombre).toBe('Sin nombre')
  })
})
