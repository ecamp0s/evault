import { describe, expect, it } from 'vitest'
import { isReplaceableChromeDir, parseLocalInstance } from './localInstance'

describe('the local instance file', () => {
  it('reads the origins and the Chrome folder, and nothing else', () => {
    const text = [
      '# a comment',
      'EVAULT_EXTENSION_ORIGINS=https://a.example,https://b.example',
      'EVAULT_CHROME_EXTENSION_DIR=/mnt/c/Users/someone/extension',
      'WEB_EXT_API_SECRET=never-read-here',
    ].join('\n')

    expect(parseLocalInstance(text)).toEqual({
      origins: 'https://a.example,https://b.example',
      chromeDir: '/mnt/c/Users/someone/extension',
    })
  })

  it('takes off the quotes a shell file may carry, and the spaces around', () => {
    expect(parseLocalInstance(`  EVAULT_EXTENSION_ORIGINS="https://a.example"  \nEVAULT_CHROME_EXTENSION_DIR='/x'`)).toEqual({
      origins: 'https://a.example',
      chromeDir: '/x',
    })
  })

  it('leaves a key out when its value is empty or commented', () => {
    expect(parseLocalInstance('EVAULT_EXTENSION_ORIGINS=\n# EVAULT_CHROME_EXTENSION_DIR=/x')).toEqual({})
  })
})

describe('whether the Chrome folder may be replaced', () => {
  const manifest = (fields: object) => JSON.stringify({ manifest_version: 3, name: 'eVault', ...fields })

  it('replaces an empty folder', () => {
    expect(isReplaceableChromeDir([], null)).toBe(true)
  })

  it('replaces a folder that holds an eVault extension', () => {
    expect(isReplaceableChromeDir(['manifest.json', 'assets'], manifest({}))).toBe(true)
  })

  it.each([
    ['a folder with files and no manifest', ['notes.txt'], null],
    ['another extension', ['manifest.json'], manifest({ name: 'Other' })],
    ['the Firefox build, which is Manifest V2', ['manifest.json'], manifest({ manifest_version: 2 })],
    ['a manifest that is not JSON', ['manifest.json'], '{ not json'],
  ])('refuses %s', (_, entries, text) => {
    expect(isReplaceableChromeDir(entries, text)).toBe(false)
  })
})
