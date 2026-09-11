import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ONE CRYPTOGRAPHIC IMPLEMENTATION: nothing in the extension's own code touches
 * `crypto.subtle`. It imports web/src/lib/vault instead (ADR-023 §2.8).
 *
 * THIS TEST IS THE GUARANTEE AND THE LINT RULE IS THE EARLY WARNING, and the order was
 * learnt by mutating the rule. `no-restricted-syntax` caught `crypto.subtle`,
 * `globalThis.crypto.subtle` and, once widened, `window.crypto['subtle']` — and let
 * ``window.crypto[`subtle`]`` through. Destructuring or a computed key would go through
 * too. A rule about syntax cannot close every way of spelling a property; a search for
 * the word can, at the price of refusing it in a comment as well, which is cheap here.
 */

const SOURCE = new URL('.', import.meta.url).pathname

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|html)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

describe('the extension has no cryptography of its own', () => {
  it('looks at some files, so a wrong path cannot pass by finding nothing', () => {
    expect(sourceFiles(SOURCE).map((path) => relative(SOURCE, path))).toContain('popup.ts')
  })

  it('never names crypto.subtle, however it is spelt', () => {
    const offenders = sourceFiles(SOURCE)
      .filter((path) => /subtle/i.test(readFileSync(path, 'utf-8')))
      .map((path) => relative(SOURCE, path))

    expect(offenders).toEqual([])
  })
})
