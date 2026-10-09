import { describe, expect, it } from 'vitest'
import { isLockShortcut } from './shortcuts'

const press = (fields: Partial<KeyboardEvent>) =>
  ({ code: 'KeyL', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false, repeat: false, ...fields }) as KeyboardEvent

describe('the lock shortcut', () => {
  it.each([
    ['Ctrl+Shift+L', { ctrlKey: true }],
    ['Cmd+Shift+L on a Mac', { metaKey: true }],
  ])('is %s', (_, fields) => {
    expect(isLockShortcut(press(fields))).toBe(true)
  })

  it.each([
    ['without Shift', { ctrlKey: true, shiftKey: false }],
    ['without Ctrl or Cmd', {}],
    ['with Alt as well, which is AltGr on a Spanish keyboard', { ctrlKey: true, altKey: true }],
    ['another key', { ctrlKey: true, code: 'KeyK' }],
    ['a key held down, repeating', { ctrlKey: true, repeat: true }],
  ])('is not the combination %s', (_, fields) => {
    expect(isLockShortcut(press(fields))).toBe(false)
  })
})
