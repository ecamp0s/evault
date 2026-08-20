import { beforeAll, describe, expect, it } from 'vitest'
import { unpack, pack } from './payload'
import { CIPHER_VERSION } from './crypto'
import { testKey } from '@/test/vault'
import type { ItemContent, EncryptedItem } from './types'

/*
 * Replaces sinCifrar.test.ts. The cases are almost the same because the contract did
 * not change — that was the promise of issue #54 and it was kept — but two differences
 * matter: the content can no longer be read without the key, and the version written
 * is 2.
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

/** An item as the API would return it, wrapping the payload given. */
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

describe('packing and unpacking', () => {
  it('the full round trip returns the same content', async () => {
    const content: ItemContent = {
      nombre: 'GitHub',
      usuario: 'ada@example.com',
      password: 'una-contraseña-larga',
      url: 'https://github.com',
      notas: 'la de la cuenta vieja',
    }

    expect(await roundTrip(content)).toEqual(content)
  })

  it('keeps track of the fields that were not filled in', async () => {
    expect(await roundTrip({ nombre: 'Solo el nombre' })).toEqual({ nombre: 'Solo el nombre' })
  })

  /*
   * Iteration 2's btoa lesson, which still holds under real encryption because the
   * JSON is turned into bytes through UTF-8 before being encrypted.
   */
  it('survives accents, emoji and non-Latin alphabets', async () => {
    const content: ItemContent = {
      nombre: 'Correo del año 漢字',
      usuario: 'añoñó@example.com',
      password: 'çontraseña-🔐-ñ',
      notas: 'Ω≈ç√∫˜µ',
    }

    expect(await roundTrip(content)).toEqual(content)
  })

  it('survives quotes, newlines and braces', async () => {
    const content: ItemContent = {
      nombre: 'Con "comillas" y \'apóstrofes\'',
      notas: 'linea 1\nlinea 2\t{"json":"falso"}',
    }

    expect(await roundTrip(content)).toEqual(content)
  })

  it('marks the payload with the version of the real encryption', async () => {
    const payload = await pack(key, { nombre: 'X' })

    expect(payload.version).toBe(CIPHER_VERSION)
    expect(payload.version).toBe(2)
  })

  /*
   * The exact reverse of the test that in Iteration 2 checked the opposite: «today the
   * content is readable with no key at all, which is precisely the debt». That test
   * warned its day would come, and this is the day.
   */
  it('the content can no longer be read without the key', async () => {
    const payload = await pack(key, { nombre: 'GitHub', password: 'secreto' })

    expect(atob(payload.ciphertext)).not.toContain('secreto')
    expect(atob(payload.ciphertext)).not.toContain('GitHub')
  })

  it('saving the same content twice does not produce the same payload', async () => {
    const firstOne = await pack(key, { nombre: 'GitHub' })
    const secondOne = await pack(key, { nombre: 'GitHub' })

    expect(firstOne.ciphertext).not.toBe(secondOne.ciphertext)
    expect(firstOne.iv).not.toBe(secondOne.iv)
  })
})

describe('unpacking data it cannot read', () => {
  /*
   * Returning a marker instead of throwing is deliberate, and it is the asymmetry that
   * separates this module from crypto.ts: it is called once per row when painting the
   * list, and one broken entry cannot stop the rest from being seen.
   */
  it('does not blow up on an unknown schema version', async () => {
    const item = itemWith({ ciphertext: 'lo-que-sea', iv: 'x', version: 99 })

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  /*
   * Any items left over from Iteration 2. They were never encrypted, so no key opens
   * them; the version is checked before trying so they are not decrypted to rubbish,
   * which is what AES-GCM would do without complaining about the tag.
   */
  it('does not try to decrypt an item of the earlier encoding', async () => {
    const item = itemWith({ ciphertext: btoa('{"nombre":"GitHub"}'), iv: 'sin-cifrar', version: 1 })

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  /*
   * The case of a different master password. Here GCM's tag does do its job: the
   * decryption fails instead of returning arbitrary bytes.
   */
  it('does not blow up on an item encrypted under another key', async () => {
    const item = itemWith(await pack(otherKey, { nombre: 'De otra persona' }))

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  it('does not blow up on a tampered ciphertext', async () => {
    const payload = await pack(key, { nombre: 'GitHub' })

    // A different character, not a fixed one: if the original already began with A,
    // nothing would change.
    const tampered = (payload.ciphertext[0] === 'A' ? 'B' : 'A') + payload.ciphertext.slice(1)

    expect(
      (await unpack(key, itemWith({ ...payload, ciphertext: tampered }))).nombre,
    ).toBe('No se puede leer esta entrada')
  })

  it('does not blow up on a ciphertext that is not base64', async () => {
    const item = itemWith({ ciphertext: '!!!no-base64!!!', iv: 'x', version: CIPHER_VERSION })

    expect((await unpack(key, item)).nombre).toBe('No se puede leer esta entrada')
  })

  it('puts in a filler name when the decrypted object carries none', async () => {
    const payload = await pack(key, { password: 'x' } as ItemContent)

    expect((await unpack(key, itemWith(payload))).nombre).toBe('Sin nombre')
  })
})
