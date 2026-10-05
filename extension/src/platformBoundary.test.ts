import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * ONE EXTENSION, NOT ONE PER BROWSER: a browser's extension API is only called from
 * src/platform/<browser>/ (ADR-025 §2.8). The popup, the custody, the fill and the unlock
 * are shared, and a `chrome.tabs` written in one of them is Firefox quietly getting a copy
 * of that file the day it needs a different call.
 *
 * IT READS THE SYNTAX TREE AND NOT THE TEXT, and that is why it can be strict where
 * oneImplementation.test.ts cannot. A text search would trip on the comments that explain
 * why a call is made — the reason for several of them is a measurement worth keeping — and
 * on `typeof chrome.scripting` in a type, which runs nothing. The tree tells a value from a
 * comment and from a type, and it sees the spellings a pattern misses: `globalThis.chrome`,
 * `window['browser']`, `const { tabs } = chrome`.
 */

const SOURCE = new URL('.', import.meta.url).pathname
const NAMESPACES = new Set(['chrome', 'browser'])
const GLOBALS = new Set(['globalThis', 'window', 'self'])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path)
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : []
  })
}

function inType(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true
  }
  return false
}

/** Every place this source reads a browser's extension namespace as a value, by line. */
export function browserApiUses(code: string, fileName = 'file.ts'): number[] {
  const tree = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true)
  const lines: number[] = []
  const at = (node: ts.Node) => lines.push(tree.getLineAndCharacterOfPosition(node.getStart()).line + 1)

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && NAMESPACES.has(node.text) && !inType(node)) {
      const parent = node.parent
      const isMemberName = (ts.isPropertyAccessExpression(parent) && parent.name === node) || ts.isPropertyAssignment(parent) && parent.name === node
      if (!isMemberName) at(node)
      else if (ts.isPropertyAccessExpression(parent) && ts.isIdentifier(parent.expression) && GLOBALS.has(parent.expression.text)) at(node)
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      NAMESPACES.has(node.argumentExpression.text)
    ) {
      at(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(tree)
  return lines
}

describe('a browser API is only called from its platform module', () => {
  it('finds the spellings a text search would miss, and skips comments and types', () => {
    expect(browserApiUses('chrome.tabs.query({})')).toEqual([1])
    expect(browserApiUses('globalThis.chrome.tabs')).toEqual([1])
    expect(browserApiUses("window['browser'].tabs")).toEqual([1])
    expect(browserApiUses('const { tabs } = chrome')).toEqual([1])
    expect(browserApiUses('await browser.storage.local.get("k")')).toEqual([1])

    expect(browserApiUses('// chrome.tabs.query, explained\n/* browser.tabs */ const a = 1')).toEqual([])
    expect(browserApiUses("let s: Pick<typeof chrome.scripting, 'executeScript'>")).toEqual([])
    expect(browserApiUses('const o = { chrome: 1 }; o.chrome')).toEqual([])
  })

  it('looks at the shared files, so a wrong path cannot pass by finding nothing', () => {
    const shared = sourceFiles(SOURCE).map((path) => relative(SOURCE, path))
    expect(shared).toContain('popup.ts')
    expect(shared).toContain(join('custody', 'client.ts'))
  })

  it('sees the calls that do exist, in the platform modules', () => {
    const chromeModule = join(SOURCE, 'platform', 'chrome', 'index.ts')
    expect(browserApiUses(readFileSync(chromeModule, 'utf8'), chromeModule).length).toBeGreaterThan(0)
  })

  it('finds none anywhere else', () => {
    const platformDir = join(SOURCE, 'platform') + sep
    const offenders = sourceFiles(SOURCE)
      .filter((path) => !path.startsWith(platformDir) || relative(platformDir, path).split(sep).length === 1)
      .flatMap((path) => browserApiUses(readFileSync(path, 'utf8'), path).map((line) => `${relative(SOURCE, path)}:${line}`))

    expect(offenders).toEqual([])
  })
})
