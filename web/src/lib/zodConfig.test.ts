import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import './zodConfig'
// With ?raw, as startup.test.ts does: no node:fs types in the web's tests.
import main from '../main.tsx?raw'

describe('Zod under the production CSP (#774)', () => {
  it('runs jitless, so it never probes new Function and the CSP records no violation', () => {
    expect(z.config().jitless).toBe(true)
  })

  /*
   * The setting only helps if it lands before any schema is used, and main.tsx is where
   * the order is decided: an import further down would run after the modules above it.
   */
  it('is the first import of main.tsx', () => {
    const firstImport = main.split('\n').find((line: string) => line.startsWith('import '))
    expect(firstImport).toBe("import '@/lib/zodConfig'")
  })
})
