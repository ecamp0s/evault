import { describe, expect, it } from 'vitest'
import { InvalidTarget, parseBrowser } from './target'

describe('the browser a build is for', () => {
  it('is Chrome when nothing is said, so the installed build does not change by omission', () => {
    expect(parseBrowser(undefined)).toBe('chrome')
    expect(parseBrowser('')).toBe('chrome')
  })

  it('accepts Chrome however it is written', () => {
    expect(parseBrowser('chrome')).toBe('chrome')
    expect(parseBrowser(' Chrome ')).toBe('chrome')
  })

  it('builds Firefox when asked, however it is written', () => {
    expect(parseBrowser('firefox')).toBe('firefox')
    expect(parseBrowser('Firefox')).toBe('firefox')
  })

  it('refuses a name it does not know, and says which ones it does', () => {
    expect(() => parseBrowser('safari')).toThrow(InvalidTarget)
    expect(() => parseBrowser('safari')).toThrow(/safari.*chrome, firefox/)
  })
})
