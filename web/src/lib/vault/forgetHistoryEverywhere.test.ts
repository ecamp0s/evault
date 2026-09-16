import { describe, expect, it, vi } from 'vitest'
import {
  forgetHistoryEverywhere,
  historyAcrossTheVault,
} from '@/lib/vault/forgetHistoryEverywhere'
import type { HistoryEntry, Item, ItemContent } from '@/lib/vault/types'

const retired = (password: string): HistoryEntry => ({
  password,
  date: '2026-01-01T00:00:00.000Z',
  origin: 'rotation',
})

const candidate = (password: string): HistoryEntry => ({
  password,
  date: '2026-02-01T00:00:00.000Z',
  origin: 'import',
})

const item = (id: string, history?: HistoryEntry[]): Item => ({
  id,
  vaultId: 'vault-1',
  content: { name: id, password: 'la-actual', ...(history ? { history } : {}) } as ItemContent,
  createdAt: null,
  updatedAt: null,
})

describe('what the vault holds beyond what its owner typed', () => {
  it('counts the entries with history and the passwords inside them', () => {
    const across = historyAcrossTheVault([
      item('con-dos', [retired('vieja'), retired('mas-vieja')]),
      item('sin-nada'),
      item('con-una', [retired('otra')]),
    ])

    expect(across.entries.map((one) => one.id)).toEqual(['con-dos', 'con-una'])
    expect(across.passwords).toBe(3)
  })

  /*
   * THE CANDIDATES ARE COUNTED APART because forgetting there is not only forgetting:
   * with two passwords and nobody's word on which works, the one thrown away may be the
   * good one. `ADR-022` §2.2 is what makes the two tellable apart at all.
   */
  it('separates the entries where forgetting decides a conflict', () => {
    const across = historyAcrossTheVault([
      item('rotada', [retired('vieja')]),
      item('sin-confirmar', [candidate('la-del-otro-gestor')]),
    ])

    expect(across.unconfirmed.map((one) => one.id)).toEqual(['sin-confirmar'])
    expect(across.entries).toHaveLength(2)
  })

  it('an empty history does not count as history', () => {
    expect(historyAcrossTheVault([item('vacia', [])]).entries).toEqual([])
  })

  it('a vault with nothing to forget says so with zeros', () => {
    const across = historyAcrossTheVault([item('a'), item('b')])

    expect(across).toEqual({ entries: [], passwords: 0, unconfirmed: [] })
  })
})

describe('forgetting it across the vault', () => {
  it('writes every entry with its history gone, and nothing else', async () => {
    const written: [string, ItemContent][] = []
    const entries = [item('una', [retired('vieja')]), item('otra', [candidate('la-otra')])]

    const result = await forgetHistoryEverywhere(entries, async (one, content) => {
      written.push([one.id, content])
    })

    expect(result).toEqual({ done: 2 })
    expect(written.map(([id]) => id)).toEqual(['una', 'otra'])
    for (const [, content] of written) expect(content).not.toHaveProperty('history')
  })

  /*
   * ONLY WHAT HAS HISTORY IS WRITTEN, which is a criterion of #646 and not an
   * optimisation: over 669 entries, rewriting the ones with nothing to forget would be
   * hundreds of requests that change nothing — and every one of them a chance for the run
   * to stop half way for no reason at all.
   */
  it('does not go near an entry with nothing to forget', async () => {
    const write = vi.fn()
    const across = historyAcrossTheVault([item('limpia'), item('sucia', [retired('vieja')])])

    await forgetHistoryEverywhere(across.entries, write)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0].id).toBe('sucia')
  })

  /*
   * THE COUNT SURVIVES THE FAILURE, and that is the whole reason this returns instead of
   * throwing: forgetting cannot be undone, so «ha fallado» without a number leaves the
   * person unable to tell what is left.
   */
  it('says how many it got through when something cuts it halfway', async () => {
    const entries = ['a', 'b', 'c'].map((id) => item(id, [retired('vieja')]))
    const boom = new Error('se ha caído la conexión')

    const result = await forgetHistoryEverywhere(entries, async (one) => {
      if (one.id === 'c') throw boom
    })

    expect(result.done).toBe(2)
    expect(result.failure).toBe(boom)
  })

  it('counts nothing when the very first one fails', async () => {
    const result = await forgetHistoryEverywhere([item('a', [retired('vieja')])], async () => {
      throw new Error('no')
    })

    expect(result.done).toBe(0)
  })

  it('reports its progress as it goes, so a long run is not a frozen screen', async () => {
    const seen: number[] = []
    const entries = ['a', 'b', 'c'].map((id) => item(id, [retired('vieja')]))

    await forgetHistoryEverywhere(entries, async () => {}, (done) => seen.push(done))

    expect(seen).toEqual([1, 2, 3])
  })

  it('does not report progress for a write that failed', async () => {
    const seen: number[] = []
    const entries = ['a', 'b'].map((id) => item(id, [retired('vieja')]))

    await forgetHistoryEverywhere(
      entries,
      async (one) => {
        if (one.id === 'b') throw new Error('no')
      },
      (done) => seen.push(done),
    )

    expect(seen).toEqual([1])
  })
})
