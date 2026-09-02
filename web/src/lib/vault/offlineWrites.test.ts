import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { unlockForTest } from '@/test/vault'
import { OfflineWrite, createItem, deleteItem, updateItem } from '@/lib/vault/api'

/*
 * Writing while the session is reading the copy on this device. See ADR-019 §3 and §4,
 * and issue #467.
 *
 * WHY THE REFUSAL IS HERE AND NOT IN THE SCREENS: this is the one place every write
 * passes through, so it is the one place that cannot be forgotten. A guard per dialog
 * would be three guards, and the fourth screen to write something would have none — so
 * this file checks the three by calling them directly rather than through any interface.
 *
 * AND WHAT IT REALLY PROTECTS IS THAT NO REQUEST LEAVES. An offline session has no token:
 * the write would come back 401, which reads as a credentials problem and, on a flaky
 * network, is indistinguishable from a session that really did expire.
 */

beforeEach(async () => {
  await unlockForTest()
  useSession.setState({ user: null, token: null, offline: false, rememberedUser: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('with an offline session', () => {
  beforeEach(() => {
    useSession.setState({ offline: true })
  })

  it.each([
    ['creating', () => createItem('vault-1', { nombre: 'GitHub' })],
    ['editing', () => updateItem('vault-1', 'item-1', { nombre: 'GitHub' })],
    ['deleting', () => deleteItem('vault-1', 'item-1')],
  ])('refuses %s', async (_, write) => {
    await expect(write()).rejects.toBeInstanceOf(OfflineWrite)
  })

  it.each([
    ['creating', () => createItem('vault-1', { nombre: 'GitHub' })],
    ['editing', () => updateItem('vault-1', 'item-1', { nombre: 'GitHub' })],
    ['deleting', () => deleteItem('vault-1', 'item-1')],
  ])('sends nothing at all when %s', async (_, write) => {
    const post = vi.spyOn(api, 'post')
    const patch = vi.spyOn(api, 'patch')
    const remove = vi.spyOn(api, 'delete')

    await expect(write()).rejects.toThrow()

    expect(post).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  /*
   * The dialogs keep what was typed by catching `ApiError` and nothing else. If this
   * stopped being one, a refused save would crash the dialog and take the entry with it
   * — which is a far worse outcome than not being able to save.
   */
  it('fails as an ApiError, so the dialogs keep what was typed', async () => {
    const error = await createItem('vault-1', { nombre: 'GitHub' }).catch((raised) => raised)

    expect(error).toBeInstanceOf(OfflineWrite)
    expect(error.isNetwork).toBe(true)
    expect(error.name).toBe('OfflineWrite')
  })
})

describe('with an ordinary session', () => {
  /*
   * The other half, and the one that would break silently: a guard that refused too much
   * would make the application unable to save anything, and every test above would still
   * pass.
   */
  it('writes go out as usual', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('hasta aquí basta'))

    await expect(createItem('vault-1', { nombre: 'GitHub' })).rejects.toThrow()

    expect(post).toHaveBeenCalledOnce()
  })

  /*
   * A network blip on an online session is not the same thing at all: the session can
   * still write, so retrying once the network is back has to work with no reload. The
   * refusal must not latch on to a failure.
   */
  it('a failed write does not stop the next one', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('la segunda también llega al servidor'))

    await expect(createItem('vault-1', { nombre: 'GitHub' })).rejects.toThrow()
    await expect(createItem('vault-1', { nombre: 'GitHub' })).rejects.toThrow()

    expect(post).toHaveBeenCalledTimes(2)
  })
})
