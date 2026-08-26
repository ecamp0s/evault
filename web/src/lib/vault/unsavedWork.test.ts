import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { hasUnsavedRecoveryKey, hasUnsavedWork, useUnsavedWork, useUnsavedWorkWhile } from './unsavedWork'

beforeEach(() => {
  useUnsavedWork.setState({ count: 0, kinds: { 'texto': 0, 'clave-de-recuperacion': 0 } })
})

describe('unsaved work', () => {
  it('reports nothing to lose while no form has registered', () => {
    expect(hasUnsavedWork()).toBe(false)
  })

  it('reports work while a dirty form is mounted', () => {
    renderHook(() => useUnsavedWorkWhile(true))

    expect(hasUnsavedWork()).toBe(true)
  })

  it('stops reporting once that form unmounts', () => {
    const { unmount } = renderHook(() => useUnsavedWorkWhile(true))

    unmount()

    expect(hasUnsavedWork()).toBe(false)
  })

  it('ignores a form that has nothing unsaved', () => {
    renderHook(() => useUnsavedWorkWhile(false))

    expect(hasUnsavedWork()).toBe(false)
  })

  it('follows a form that becomes dirty and clean again', () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedWorkWhile(dirty), {
      initialProps: { dirty: false },
    })

    rerender({ dirty: true })
    expect(hasUnsavedWork()).toBe(true)

    rerender({ dirty: false })
    expect(hasUnsavedWork()).toBe(false)
  })

  it('still reports work while a second form is open', () => {
    /*
     * WHY THE COUNTER IS NOT A BOOLEAN. With a flag, the first dialog to close would
     * clear it for the one still holding text, and the warning would go back to
     * saying there is nothing to lose while there is.
     */
    const first = renderHook(() => useUnsavedWorkWhile(true))
    renderHook(() => useUnsavedWorkWhile(true))

    first.unmount()

    expect(hasUnsavedWork()).toBe(true)
  })

  it('never counts below zero', () => {
    const { unregister } = useUnsavedWork.getState()

    unregister()
    unregister()

    expect(useUnsavedWork.getState().count).toBe(0)
    expect(hasUnsavedWork()).toBe(false)
  })
})

/**
 * Telling a lost draft from a lost recovery key. See #329.
 *
 * The warning of #303 says «what you have written will be lost», which is true of text
 * and misleading of a recovery key: that one is already registered on the server by the
 * time it reaches the screen, so what disappears is the only readable copy of a key the
 * account will keep claiming to have.
 */
describe('what kind of work is at stake', () => {
  it('an ordinary form is not a recovery key', () => {
    renderHook(() => useUnsavedWorkWhile(true))

    expect(hasUnsavedWork()).toBe(true)
    expect(hasUnsavedRecoveryKey()).toBe(false)
  })

  it('a recovery key on screen is reported as both', () => {
    renderHook(() => useUnsavedWorkWhile(true, 'clave-de-recuperacion'))

    // Both, because it IS unsaved work: the generic warning still has to fire.
    expect(hasUnsavedWork()).toBe(true)
    expect(hasUnsavedRecoveryKey()).toBe(true)
  })

  it('stops reporting the key once its screen unmounts', () => {
    const { unmount } = renderHook(() => useUnsavedWorkWhile(true, 'clave-de-recuperacion'))

    unmount()

    expect(hasUnsavedRecoveryKey()).toBe(false)
  })

  it('a form closing does not clear a recovery key still on screen', () => {
    /*
     * The reason the kinds are counted and not flags, and the same trap the count
     * itself already avoided: with a boolean, the first screen to close would answer
     * for the one still open — and the sentence about the key would go missing exactly
     * when it is true.
     */
    renderHook(() => useUnsavedWorkWhile(true, 'clave-de-recuperacion'))
    const form = renderHook(() => useUnsavedWorkWhile(true))

    form.unmount()

    expect(hasUnsavedRecoveryKey()).toBe(true)
    expect(hasUnsavedWork()).toBe(true)
  })

  it('never counts a kind below zero', () => {
    useUnsavedWork.getState().unregister('clave-de-recuperacion')

    expect(hasUnsavedRecoveryKey()).toBe(false)
  })
})
