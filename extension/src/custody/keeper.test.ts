import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INACTIVITY_LIMIT_MS } from '@/lib/vault/autoLock'
import { Keeper, type Held } from './keeper'

async function vaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function held(token = 'token-1'): Promise<Held> {
  return { key: await vaultKey(), token, vaultId: 'vault-1', email: 'ada@evault.test', instance: 'https://vault.test' }
}

describe('Keeper', () => {
  let revoke: ReturnType<typeof vi.fn<(instance: string, token: string) => Promise<unknown>>>
  let forgotten: string[]
  let keeper: Keeper

  beforeEach(() => {
    vi.useFakeTimers()
    revoke = vi.fn<(instance: string, token: string) => Promise<unknown>>().mockResolvedValue(true)
    forgotten = []
    keeper = new Keeper({
      revoke,
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      onForgotten: (reason) => forgotten.push(reason),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds nothing until something is unlocked', () => {
    expect(keeper.ask()).toBeNull()
  })

  it('gives back what it holds', async () => {
    const unlocked = await held()
    keeper.hold(unlocked)

    expect(keeper.ask()).toBe(unlocked)
  })

  it('forgets the key and revokes the token when asked to lock', async () => {
    keeper.hold(await held())

    keeper.forget('manual')

    expect(keeper.ask()).toBeNull()
    expect(revoke).toHaveBeenCalledWith('https://vault.test', 'token-1')
    expect(forgotten).toEqual(['manual'])
  })

  /*
   * THE KEY IS GONE BEFORE THE REVOCATION ANSWERS. With no network the request can hang,
   * and a lock that waited for it would leave the vault open for as long as it hangs.
   */
  it('is locked the instant forget returns, even if the revocation never answers', async () => {
    revoke.mockReturnValue(new Promise(() => {}))
    keeper.hold(await held())

    keeper.forget('manual')

    expect(keeper.ask()).toBeNull()
  })

  it('does not throw nor keep the key when the revocation fails', async () => {
    revoke.mockRejectedValue(new Error('offline'))
    keeper.hold(await held())

    expect(() => keeper.forget('manual')).not.toThrow()
    expect(keeper.ask()).toBeNull()
  })

  it('locks by itself after the web inactivity limit', async () => {
    keeper.hold(await held())

    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1)
    expect(keeper.ask()).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(keeper.ask()).toBeNull()
    expect(forgotten).toEqual(['inactivity'])
    expect(revoke).toHaveBeenCalledOnce()
  })

  it('starts the countdown again when the extension is used', async () => {
    keeper.hold(await held())

    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1000)
    keeper.touch()
    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1000)

    expect(keeper.ask()).not.toBeNull()
  })

  /*
   * Asking is what a popup does every time it opens. If that counted as use, merely
   * glancing at the popup would keep the vault open forever.
   */
  it('does not count asking as use', async () => {
    keeper.hold(await held())

    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS - 1000)
    keeper.ask()
    vi.advanceTimersByTime(1000)

    expect(keeper.ask()).toBeNull()
  })

  it('does not bring a countdown back to life with a touch after locking', async () => {
    keeper.hold(await held())
    keeper.forget('manual')

    keeper.touch()
    vi.advanceTimersByTime(INACTIVITY_LIMIT_MS)

    expect(forgotten).toEqual(['manual'])
  })

  it('revokes the previous token when a second unlock replaces the first', async () => {
    keeper.hold(await held('token-old'))
    keeper.hold(await held('token-new'))

    expect(revoke).toHaveBeenCalledWith('https://vault.test', 'token-old')
    expect(keeper.ask()?.token).toBe('token-new')
  })

  it('forgetting while locked does nothing and revokes nothing', () => {
    keeper.forget('system-locked')

    expect(revoke).not.toHaveBeenCalled()
    expect(forgotten).toEqual([])
  })
})
