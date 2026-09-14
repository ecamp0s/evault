import { describe, expect, it, vi } from 'vitest'
import type { Item } from '@/lib/vault/types'
import { injectFill } from './inject'
import { fillInPage } from './inPage'

const item: Item = {
  id: 'i',
  vaultId: 'v',
  content: { name: 'GitHub', username: 'ada', password: 's3cr3t', url: 'https://www.github.com/login' },
  createdAt: null,
  updatedAt: null,
}

describe('injecting the fill', () => {
  it('targets the tab and nothing more: no frames, the top one alone', async () => {
    const executeScript = vi.fn().mockResolvedValue([{ result: 'filled' }])

    await injectFill({ executeScript } as never, 7, item)

    const [{ target }] = executeScript.mock.calls[0]
    expect(target).toEqual({ tabId: 7 })
  })

  it('sends the in-page function with the entry and the entry host, not the tab one', async () => {
    const executeScript = vi.fn().mockResolvedValue([{ result: 'filled' }])

    expect(await injectFill({ executeScript } as never, 7, item)).toBe('filled')

    const [{ func, args }] = executeScript.mock.calls[0]
    expect(func).toBe(fillInPage)
    expect(args).toEqual(['ada', 's3cr3t', 'github.com'])
  })

  it('reads a refusal to inject as a page it cannot reach', async () => {
    const executeScript = vi.fn().mockRejectedValue(new Error('Cannot access contents of the page'))

    expect(await injectFill({ executeScript } as never, 7, item)).toBe('unreachable')
  })
})
