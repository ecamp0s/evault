import { describe, expect, it } from 'vitest'

/**
 * WHY THE KEY TRAVELS OVER BroadcastChannel AND NOT chrome.runtime.sendMessage (ADR-023 §4),
 * written as tests so the reason cannot drift from the code.
 *
 * Both are measured in a browser for ADR-023; these run the same property on Node's own
 * implementation of the two primitives involved, structured clone and JSON.
 */

async function nonExtractableKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

describe('moving the vault key between extension contexts', () => {
  it('arrives intact and still non-extractable over a BroadcastChannel', async () => {
    const key = await nonExtractableKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('secreto'))

    const sender = new BroadcastChannel('custody-test')
    const receiver = new BroadcastChannel('custody-test')
    const arrived = new Promise<CryptoKey>((resolve) => {
      receiver.onmessage = ({ data }) => resolve(data.key)
    })

    sender.postMessage({ key })
    const received = await arrived
    sender.close()
    receiver.close()

    expect(received.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', received)).rejects.toThrow()
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, received, sealed)
    expect(new TextDecoder().decode(opened)).toBe('secreto')
  })

  /*
   * What sendMessage would carry: JSON. A CryptoKey has no enumerable own properties, so it
   * becomes an empty object — the key would silently not arrive, and the only way to make
   * it arrive would be to export it raw, which a non-extractable key refuses.
   */
  it('would be lost as an empty object through JSON, which is what sendMessage uses', async () => {
    const key = await nonExtractableKey()

    expect(JSON.parse(JSON.stringify({ key }))).toEqual({ key: {} })
  })
})
