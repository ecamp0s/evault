import { describe, expect, it } from 'vitest'
import { isLockShortcut, isSearchShortcut, isTyping } from './shortcuts'

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

describe('the search shortcut', () => {
  const slash = (fields: Partial<KeyboardEvent>) =>
    ({ key: '/', ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...fields }) as KeyboardEvent

  it('is /, with or without Shift, which is how a Spanish keyboard writes it', () => {
    expect(isSearchShortcut(slash({}))).toBe(true)
    expect(isSearchShortcut(slash({ shiftKey: true }))).toBe(true)
  })

  it.each([
    ['with Ctrl', { ctrlKey: true }],
    ['with Cmd', { metaKey: true }],
    ['with Alt', { altKey: true }],
    ['held down, repeating', { repeat: true }],
    ['another key', { key: '7' }],
  ])('is not / %s', (_, fields) => {
    expect(isSearchShortcut(slash(fields))).toBe(false)
  })
})

describe('telling somebody typing', () => {
  it.each([
    ['a text field', '<input>'],
    ['a text area', '<textarea></textarea>'],
    ['a select', '<select></select>'],
  ])('in %s', (_, html) => {
    document.body.innerHTML = html
    expect(isTyping(document.body.firstElementChild)).toBe(true)
  })

  it('in an editable element', () => {
    const element = document.createElement('div')
    element.contentEditable = 'true'
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(element, 'isContentEditable', { value: true })
    expect(isTyping(element)).toBe(true)
  })

  it('not on a button, nor on the page itself', () => {
    expect(isTyping(document.createElement('button'))).toBe(false)
    expect(isTyping(document.body)).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
