import { describe, expect, it } from 'vitest'
import { IV_SIN_CIFRAR, VERSION_SIN_CIFRAR, desempaquetar, empaquetar } from './sinCifrar'
import type { ContenidoDeItem, ItemCifrado } from './tipos'

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

function ida(contenido: ContenidoDeItem): ContenidoDeItem {
  return desempaquetar(itemCon(empaquetar(contenido)))
}

describe('empaquetar y desempaquetar', () => {
  it('el ciclo completo devuelve el mismo contenido', () => {
    const contenido: ContenidoDeItem = {
      nombre: 'GitHub',
      usuario: 'ada@example.com',
      password: 'una-contraseña-larga',
      url: 'https://github.com',
      notas: 'la de la cuenta vieja',
    }

    expect(ida(contenido)).toEqual(contenido)
  })

  it('conserva los campos que no se han rellenado', () => {
    expect(ida({ nombre: 'Solo el nombre' })).toEqual({ nombre: 'Solo el nombre' })
  })

  /*
   * btoa solo maneja latin1, así que sin pasar por UTF-8 esto reventaría. Es
   * exactamente el caso que aparece en cuanto alguien escribe una contraseña con
   * acentos o un nombre en otro alfabeto.
   */
  it('sobrevive a acentos, emoji y alfabetos no latinos', () => {
    const contenido: ContenidoDeItem = {
      nombre: 'Correo del año 漢字',
      usuario: 'añoñó@example.com',
      password: 'çontraseña-🔐-ñ',
      notas: 'Ω≈ç√∫˜µ',
    }

    expect(ida(contenido)).toEqual(contenido)
  })

  it('sobrevive a comillas, saltos de línea y llaves', () => {
    const contenido: ContenidoDeItem = {
      nombre: 'Con "comillas" y \'apóstrofes\'',
      notas: 'linea 1\nlinea 2\t{"json":"falso"}',
    }

    expect(ida(contenido)).toEqual(contenido)
  })

  it('marca el payload con la versión y el nonce de la codificación temporal', () => {
    const payload = empaquetar({ nombre: 'X' })

    expect(payload.version).toBe(VERSION_SIN_CIFRAR)
    expect(payload.iv).toBe(IV_SIN_CIFRAR)
  })

  /*
   * Recordatorio incómodo a propósito: hasta la Iteración 3 esto es reversible por
   * cualquiera. Si algún día este test falla porque el ciphertext ya no se puede
   * leer con atob, será porque el cifrado real ha llegado, y entonces toca
   * reescribirlo, no arreglarlo.
   */
  it('hoy el contenido es legible sin ninguna clave, que es justo la deuda', () => {
    const payload = empaquetar({ nombre: 'GitHub', password: 'secreto' })

    expect(atob(payload.ciphertext)).toContain('secreto')
  })
})

describe('desempaquetar ante datos que no puede leer', () => {
  it('no revienta con una versión de esquema desconocida', () => {
    const item = itemCon({ ciphertext: 'lo-que-sea', iv: 'x', version: 99 })

    expect(desempaquetar(item).nombre).toBe('No se puede leer esta entrada')
  })

  it('no revienta con un ciphertext que no es base64', () => {
    const item = itemCon({ ciphertext: '!!!no-base64!!!', iv: 'x', version: VERSION_SIN_CIFRAR })

    expect(desempaquetar(item).nombre).toBe('No se puede leer esta entrada')
  })

  it('no revienta con base64 que no contiene JSON', () => {
    const item = itemCon({ ciphertext: btoa('esto no es json'), iv: 'x', version: VERSION_SIN_CIFRAR })

    expect(desempaquetar(item).nombre).toBe('No se puede leer esta entrada')
  })

  it('no revienta si el JSON es válido pero no es un objeto', () => {
    const item = itemCon({ ciphertext: btoa('42'), iv: 'x', version: VERSION_SIN_CIFRAR })

    expect(desempaquetar(item).nombre).toBe('No se puede leer esta entrada')
  })

  it('pone un nombre de relleno si el objeto no trae ninguno', () => {
    const item = itemCon({
      ciphertext: btoa(JSON.stringify({ password: 'x' })),
      iv: 'x',
      version: VERSION_SIN_CIFRAR,
    })

    expect(desempaquetar(item).nombre).toBe('Sin nombre')
  })
})
