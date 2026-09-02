import { beforeEach, describe, expect, it } from 'vitest'
import { clearRetiredStorage } from '@/lib/retiredStorage'

/*
 * The storage keys the application no longer uses. See issue #476.
 *
 * WHAT THIS PROTECTS IS NOT THE DELETION, WHICH IS ONE LINE. It is the other half: that
 * clearing up never reaches a key that is still in use. A module whose whole job is to
 * remove things is one typo away from removing the wrong one, and the symptom would be
 * an application that forgets a preference on every load without failing at anything.
 */

beforeEach(() => {
  localStorage.clear()
})

describe('the storage this application retired', () => {
  it('removes the keys that are no longer read', () => {
    localStorage.setItem('evault.sesion', '{"state":{"rememberedUser":{"email":"ada@example.com"}}}')
    localStorage.setItem('evault.generador', '{"state":{}}')
    localStorage.setItem('evault.orden', '{"state":{}}')
    localStorage.setItem('evault.sinred', '{"state":{}}')

    clearRetiredStorage()

    expect(localStorage.getItem('evault.sesion')).toBeNull()
    expect(localStorage.getItem('evault.generador')).toBeNull()
    expect(localStorage.getItem('evault.orden')).toBeNull()
    expect(localStorage.getItem('evault.sinred')).toBeNull()
  })

  /*
   * The half that matters. If a rename ever puts a live key on the retired list, this is
   * what says so — instead of an application that quietly forgets a preference on every
   * single load.
   */
  it('leaves the keys in use untouched', () => {
    const live = {
      'evault.session': '{"state":{"rememberedUser":{"email":"ada@example.com"}}}',
      'evault.generator': '{"state":{"length":20}}',
      'evault.sort': '{"state":{"order":"name"}}',
      'evault.offline': '{"state":{"enabled":false}}',
    }

    for (const [key, value] of Object.entries(live)) localStorage.setItem(key, value)

    clearRetiredStorage()

    for (const [key, value] of Object.entries(live)) {
      expect(localStorage.getItem(key), `${key} sigue en uso`).toBe(value)
    }
  })

  it('does nothing, and complains about nothing, when there is nothing to clear', () => {
    expect(() => clearRetiredStorage()).not.toThrow()
    expect(localStorage.length).toBe(0)
  })

  /*
   * Some browsers do not merely refuse to store: they throw on the access. Tidying up is
   * the least important thing this application does, so it must never be why it fails to
   * start.
   */
  it('survives a browser that throws on being asked', () => {
    const removeItem = Storage.prototype.removeItem

    Storage.prototype.removeItem = () => {
      throw new DOMException('El acceso al almacenamiento está bloqueado')
    }

    try {
      expect(() => clearRetiredStorage()).not.toThrow()
    } finally {
      Storage.prototype.removeItem = removeItem
    }
  })
})
