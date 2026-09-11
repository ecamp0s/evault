import { describe, expect, it } from 'vitest'
import { DEFAULT_ORIGINS, InvalidInstance, parseOrigins } from './instance'

describe('parseOrigins', () => {
  it('defaults to the development instance when nothing is configured', () => {
    expect(parseOrigins(undefined)).toEqual([DEFAULT_ORIGINS])
  })

  it('accepts the two names an instance answers to, in order', () => {
    expect(parseOrigins('https://vault.example.ts.net, https://evault.local')).toEqual([
      'https://vault.example.ts.net',
      'https://evault.local',
    ])
  })

  it('drops a trailing slash, which is a way of writing the same origin', () => {
    expect(parseOrigins('https://evault.local/')).toEqual(['https://evault.local'])
  })

  it('does not repeat an origin written twice', () => {
    expect(parseOrigins('https://evault.local,https://evault.local')).toEqual(['https://evault.local'])
  })

  it('accepts plain http only under localhost, which is a secure context', () => {
    expect(parseOrigins('http://localhost:5173')).toEqual(['http://localhost:5173'])
    expect(parseOrigins('http://app.evault.localhost')).toEqual(['http://app.evault.localhost'])
  })

  it('refuses plain http anywhere else, where crypto.subtle does not exist', () => {
    expect(() => parseOrigins('http://192.168.1.20')).toThrow(InvalidInstance)
    expect(() => parseOrigins('http://evault.local')).toThrow(/https/)
  })

  it('refuses a path instead of silently keeping only the origin', () => {
    expect(() => parseOrigins('https://evault.local/vault')).toThrow(/sin ruta/)
  })

  it('refuses something that is not an address', () => {
    expect(() => parseOrigins('evault.local')).toThrow(/no es una dirección/)
  })

  it('refuses an empty list rather than building an extension that talks to nobody', () => {
    expect(() => parseOrigins(' , ')).toThrow(/vacía/)
  })
})
