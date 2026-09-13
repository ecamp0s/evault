import { describe, expect, it } from 'vitest'
import { hostOf } from '@/lib/vault/host'

describe('hostOf', () => {
  it('keeps the host of a full address and drops the path', () => {
    expect(hostOf('https://github.com/login?return_to=%2F')).toBe('github.com')
  })

  it('drops www, which is the same site to whoever owns the account', () => {
    expect(hostOf('https://www.example.com/')).toBe('example.com')
  })

  it('keeps other subdomains, which ADR-022 treats as different credentials', () => {
    expect(hostOf('https://dev.example.com')).toBe('dev.example.com')
  })

  it('reads an address written without its scheme', () => {
    expect(hostOf('accounts.example.com/signin')).toBe('accounts.example.com')
  })

  it('returns the raw text when it is not an address, so an import never drops the entry', () => {
    expect(hostOf('mi banco')).toBe('mi banco')
  })

  it('returns nothing for nothing', () => {
    expect(hostOf('   ')).toBe('')
  })
})
